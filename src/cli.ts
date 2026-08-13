import path from "node:path";
import { spawn } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import { stdin, stdout } from "node:process";

import { KTeachError } from "./errors.ts";
import { createContextPacket } from "./context-packet.ts";
import { resolveConfig } from "./config.ts";
import { validateLessonBundles } from "./lesson-bundle.ts";
import { startPreviewRuntime } from "./preview-runtime.ts";
import { renderDiagram } from "./diagram-renderer.ts";
import { registerVisualAsset } from "./visuals.ts";
import {
  confirmInteractivePublish,
  createWechatDraft,
  doctorWechat,
  previewWechatDraft,
  publishWechatDraft,
  queryWechatStatus,
  readWechatAttempt,
  resolveWechatCredentials,
  type WechatPublisherOptions,
} from "./wechat-publisher.ts";
import {
  assertWorkspaceIsCurrent,
  initializeTeach,
  initializeWorkspace,
  listTeaches,
  resolveProjectConfigRoot,
  resolveProjectRoot,
  resolveWorkspaceRoot,
} from "./workspace.ts";
import {
  AGENT_TOOLS,
  configuredTools,
  detectedTools,
  installAgentIntegrations,
  selectTools,
} from "./agent-integration.ts";
import { searchableMultiSelect } from "./searchable-multi-select.ts";
import { TEACHING_THEME_IDS } from "./teaching-themes.ts";
import { addWechatAccount, markWechatAccountSuccessful, maskedAppId, readWechatAccounts, requireWechatAccount } from "./wechat-accounts.ts";
import { userConfigDir } from "./user-paths.ts";
import {
  loadRoutePlan,
  prepareRoutePacket,
  promoteRouteArtifact,
  runGenerationRoute,
} from "./generation-route.ts";

export const CLI_VERSION = "__K_TEACH_PACKAGE_VERSION__";

async function chooseTools(
  projectRoot: string,
  toolsValue: string | undefined,
  yes = false,
) {
  if (toolsValue !== undefined) return selectTools(toolsValue);
  const detected = await detectedTools(projectRoot);
  if (yes) return detected;
  if (!stdin.isTTY || !stdout.isTTY) {
    if (detected.length > 0) return detected;
    throw new KTeachError(
      "validation-failed",
      "No Agent tools were detected.",
      "Pass --tools all, --tools none, --yes to install to detected Agents, or a comma-separated tool list.",
    );
  }
  const detectedIds = new Set(detected.map((tool) => tool.value));
  const selected = await searchableMultiSelect({
    message: `Select Agent tools to set up (${AGENT_TOOLS.length} available)`,
    pageSize: 15,
    choices: AGENT_TOOLS.map((tool) => ({
      name: tool.name,
      value: tool.value,
      detected: detectedIds.has(tool.value),
      preSelected: detectedIds.has(tool.value),
    })),
    validate: (values) =>
      values.length > 0 || "Select at least one Agent tool",
  });
  return selectTools(selected.join(","));
}

const CAPABILITIES = {
  core: ["lesson-bundle", "context-packet", "semantic-plan", "generation-run", "content-addressed-cache", "web", "diagram", "presentation-brief", "ppt", "vite-project-preview"],
  optional: ["visual-provider", "wechat", "wechat-channel-themes", "wechat-multi-account"],
  visual_modes: ["auto", "required", "off"],
  teaching_themes: TEACHING_THEME_IDS,
} as const;

async function resolveWechatAccountAlias(explicit: string | undefined, preferred?: string): Promise<string> {
  if (explicit) {
    await requireWechatAccount(explicit).catch((error) => {
      const key = `K_TEACH_WECHAT_${explicit.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_APP_ID`;
      if (!process.env[key]) throw error;
    });
    return explicit;
  }
  const registry = await readWechatAccounts();
  if (registry.accounts.length === 0) {
    if (preferred) return preferred;
    throw new KTeachError("credential-missing", "No WeChat accounts are registered.", "Run k-teach wechat account add <alias> --app-id <id> --name <name>.");
  }
  if (registry.accounts.length === 1) return registry.accounts[0].alias;
  if (!stdin.isTTY || !stdout.isTTY) throw new KTeachError("validation-failed", "Multiple WeChat accounts exist and no account was selected.", "Pass --account <alias> in non-interactive environments.");
  const last = registry.last_successful_alias;
  const accounts = [...registry.accounts].sort((left, right) => Number(right.alias === last) - Number(left.alias === last));
  const selected = await searchableMultiSelect({
    message: "Select exactly one WeChat account",
    pageSize: 12,
    choices: accounts.map((account) => ({
      name: `${account.alias} · ${account.name} · ${maskedAppId(account.app_id)} · ${account.last_doctor_status ?? "unknown"}`,
      value: account.alias,
      detected: account.alias === last,
      preSelected: account.alias === preferred,
    })),
    validate: (values) => values.length === 1 || "Select exactly one account",
  });
  return selected[0];
}

async function chooseInitialWechatAccount(
  explicit: string | undefined,
): Promise<string | undefined> {
  if (explicit) {
    await requireWechatAccount(explicit);
    return explicit;
  }
  const registry = await readWechatAccounts();
  if (registry.accounts.length === 0) return undefined;
  if (registry.accounts.length === 1) return registry.accounts[0].alias;
  if (!stdin.isTTY || !stdout.isTTY) {
    process.stdout.write(
      "Multiple WeChat accounts are registered; no project default was set. Pass --wechat-account <alias> to bind one during non-interactive init.\n",
    );
    return undefined;
  }
  const accounts = [...registry.accounts].sort(
    (left, right) =>
      Number(right.alias === registry.last_successful_alias) -
      Number(left.alias === registry.last_successful_alias),
  );
  const selected = await searchableMultiSelect({
    message: "Select the default WeChat account for this project",
    pageSize: 12,
    choices: accounts.map((account) => ({
      name: `${account.alias} · ${account.name} · ${maskedAppId(account.app_id)} · ${account.last_doctor_status ?? "unknown"}`,
      value: account.alias,
      detected: account.alias === registry.last_successful_alias,
      preSelected: account.alias === registry.last_successful_alias,
    })),
    validate: (values) => values.length === 1 || "Select exactly one account",
  });
  return selected[0];
}

async function confirmDraft(summary: string): Promise<boolean> {
  if (!stdin.isTTY || !stdout.isTTY) throw new KTeachError("validation-failed", "Creating a WeChat draft requires an interactive confirmation.", "Run the command in an interactive terminal after reviewing the account summary.");
  const reader = (await import("node:readline/promises")).createInterface({ input: stdin, output: stdout });
  try {
    return (await reader.question(`${summary}\nCreate this remote draft? [y/N] `)).trim().toLowerCase() === "y";
  } finally { reader.close(); }
}

function writeError(error: KTeachError): void {
  process.stderr.write(
    `${error.code}: ${error.message}\nNext action: ${error.nextAction}\n`,
  );
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function openBrowser(url: string): void {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const commandArgs = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, commandArgs, { detached: true, stdio: "ignore" });
  child.unref();
}

async function resolveTeach(args: string[]): Promise<string> {
  return resolveWorkspaceRoot(process.cwd(), option(args, "--teach"));
}

async function publisherOptions(
  cwd: string,
  accountAlias: string,
): Promise<WechatPublisherOptions> {
  const account = await requireWechatAccount(accountAlias).catch((error) => {
    if (process.env[`K_TEACH_WECHAT_${accountAlias.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_APP_ID`]) return undefined;
    throw error;
  });
  return {
    cwd,
    accountAlias,
    accountName: account?.name,
    credentials: resolveWechatCredentials(accountAlias, process.env, account?.app_id),
    apiBaseUrl:
      process.env.NODE_ENV === "test"
        ? process.env.K_TEACH_WECHAT_API_BASE_URL
        : undefined,
  };
}

export async function main(args: string[]): Promise<number> {
  try {
    const [command] = args;
    if (command === "init") {
      const targetArg = args[1]?.startsWith("-") ? undefined : args[1];
      const projectRoot = path.resolve(process.cwd(), targetArg ?? ".");
      const toolsValue = option(args, "--tools");
      const yes = args.includes("--yes") || args.includes("-y");
      const tools = await chooseTools(projectRoot, toolsValue, yes);
      const wechatAccount = await chooseInitialWechatAccount(
        option(args, "--wechat-account"),
      );
      await initializeWorkspace(
        projectRoot,
        option(args, "--teach") ?? "main",
        wechatAccount,
      );
      await installAgentIntegrations(projectRoot, tools, CLI_VERSION, {
        copy: args.includes("--copy"),
      });
      process.stdout.write("Learning Project, initial Teach, and Agent Integrations created.\n");
      if (process.env.npm_command === "exec") {
        process.stdout.write(
          "For persistent Agent use, run: npm install -g k-teach@latest\n",
        );
      }
      return 0;
    }
    if (command === "teach" && args[1] === "create") {
      const teachId = args[2];
      if (!teachId || teachId.startsWith("-")) {
        throw new KTeachError(
          "validation-failed",
          "A Teach ID is required.",
          "Run k-teach teach create <id>.",
        );
      }
      const projectRoot = await resolveProjectRoot(process.cwd());
      const teachRoot = await initializeTeach(projectRoot, teachId);
      process.stdout.write(`Teach created at ${teachRoot}\n`);
      return 0;
    }
    if (command === "--version" || command === "version") {
      process.stdout.write(`${CLI_VERSION}\n`);
      return 0;
    }
    if (command === "tools" && args.includes("--json")) {
      process.stdout.write(
        `${JSON.stringify(
          AGENT_TOOLS.map((tool) => ({
            id: tool.value,
            name: tool.name,
            skills_dir: tool.skillsDir,
            detection_paths: tool.detectionPaths ?? [tool.skillsDir],
            setup_note: tool.setupNote,
          })),
        )}\n`,
      );
      return 0;
    }
    if (command === "update") {
      const targetArg = args[1]?.startsWith("-") ? undefined : args[1];
      const requestedRoot = path.resolve(process.cwd(), targetArg ?? ".");
      const projectRoot = await resolveProjectRoot(requestedRoot);
      const tools = await configuredTools(projectRoot);
      if (tools.length === 0) {
        throw new KTeachError(
          "invalid-workspace",
          "No configured K Teach Agent Integrations were found.",
          "Run k-teach init --tools <tools> first.",
        );
      }
      await installAgentIntegrations(projectRoot, tools, CLI_VERSION, {
        copy: args.includes("--copy"),
      });
      process.stdout.write("K Teach Agent Integrations updated.\n");
      return 0;
    }
    if (command === "capabilities") {
      process.stdout.write(`${JSON.stringify(CAPABILITIES)}\n`);
      return 0;
    }
    if (command === "wechat" && args[1] === "account" && args[2] === "add") {
      const alias = args[3];
      const appId = option(args, "--app-id");
      const name = option(args, "--name");
      if (!alias || !appId || !name) throw new KTeachError("validation-failed", "Account alias, --app-id, and --name are required.", "Run k-teach wechat account add <alias> --app-id <id> --name <name>.");
      await addWechatAccount({ alias, app_id: appId, name, last_doctor_status: "unknown" });
      process.stdout.write(`WeChat account registered: ${alias} (${name}, ${maskedAppId(appId)})\n`);
      return 0;
    }
    if (command === "wechat" && args[1] === "account" && args[2] === "list") {
      const registry = await readWechatAccounts();
      if (args.includes("--json")) process.stdout.write(`${JSON.stringify({ ...registry, accounts: registry.accounts.map((item) => ({ ...item, app_id: maskedAppId(item.app_id) })) })}\n`);
      else process.stdout.write(registry.accounts.length === 0 ? "No WeChat accounts registered.\n" : `${registry.accounts.map((item) => `${item.alias}\t${item.name}\t${maskedAppId(item.app_id)}\t${item.last_doctor_status ?? "unknown"}`).join("\n")}\n`);
      return 0;
    }
    if (command === "validate") {
      const workspaceRoot = await resolveTeach(args);
      await assertWorkspaceIsCurrent(workspaceRoot);
      const configRoot = await resolveProjectConfigRoot(workspaceRoot);
      await resolveConfig({ cwd: configRoot, userConfigDir: userConfigDir() });
      await validateLessonBundles(workspaceRoot);
      process.stdout.write("Teach is valid.\n");
      return 0;
    }
    if (command === "context") {
      const intent = option(args, "--intent");
      const lessonId = option(args, "--lesson");
      if (intent !== "learn" && intent !== "ppt" && intent !== "wechat") {
        throw new KTeachError("validation-failed", "--intent must be learn, ppt, or wechat.", "Pass a supported output intent.");
      }
      if (!lessonId) throw new KTeachError("validation-failed", "--lesson is required.", "Pass --lesson <id>.");
      if (!args.includes("--json")) throw new KTeachError("validation-failed", "context requires --json.", "Add --json for a stable machine-readable result.");
      const workspaceRoot = await resolveTeach(args);
      await assertWorkspaceIsCurrent(workspaceRoot);
      process.stdout.write(`${JSON.stringify(await createContextPacket(workspaceRoot, intent, lessonId, option(args, "--brief")))}\n`);
      return 0;
    }
    if (command === "inspect" || command === "explain") {
      const runId = option(args, "--run");
      if (!runId || !/^run-[a-f0-9]+$/.test(runId)) throw new KTeachError("validation-failed", "A valid --run id is required.", "Pass the run ref returned by generate.");
      const workspaceRoot = await resolveTeach(args);
      const value = JSON.parse(await readFile(path.join(workspaceRoot, ".k-teach", "runs", `${runId}.json`), "utf8")) as { state: string; next_action: { code: string | null }; error?: { code: string } };
      if (command === "inspect" && args.includes("--json")) process.stdout.write(`${JSON.stringify(value)}\n`);
      else process.stdout.write(`Run ${runId}\nState: ${value.state}\nAction: ${value.next_action.code ?? "none"}${value.error ? `\nError: ${value.error.code}` : ""}\n`);
      return 0;
    }
    if (command === "generate") {
      const intent = option(args, "--intent");
      if (intent !== "learn" && intent !== "ppt" && intent !== "wechat") {
        throw new KTeachError("validation-failed", "--intent must be learn, ppt, or wechat.", "Pass a supported output intent.");
      }
      const workspaceRoot = await resolveTeach(args);
      await assertWorkspaceIsCurrent(workspaceRoot);
      const briefId = option(args, "--brief");
      const draftRequested = args.includes("--draft");
      const lessonId = option(args, "--lesson");
      const configRoot = await resolveProjectConfigRoot(workspaceRoot);
      const config = await resolveConfig({ cwd: configRoot, userConfigDir: userConfigDir() });
      const value = await runGenerationRoute({
        root: workspaceRoot,
        intent,
        lessonId,
        briefId,
        version: CLI_VERSION,
        outputDirectory: config.output_dir,
        deliveryMode: draftRequested ? "draft" : undefined,
        draftDelivery: draftRequested
          ? {
              resolvePublisher: (accountAlias) => publisherOptions(workspaceRoot, accountAlias),
              markAccountSuccessful: markWechatAccountSuccessful,
            }
          : undefined,
      });
      process.stdout.write(args.includes("--json") ? `${JSON.stringify(value)}\n` : `${value.state}: ${value.run_id}\n`);
      return value.state === "failed" || value.state === "attention_required" ? 2 : 0;
    }
    if (command === "render" && args[1] === "web") {
      const workspaceRoot = await resolveTeach(args);
      await assertWorkspaceIsCurrent(workspaceRoot);
      const configRoot = await resolveProjectConfigRoot(workspaceRoot);
      const config = await resolveConfig({
        cwd: configRoot,
        userConfigDir: userConfigDir(),
      });
      const output = await promoteRouteArtifact({
        root: workspaceRoot,
        outputDirectory: config.output_dir,
        intent: "learn",
      });
      process.stdout.write(`Web course rendered to ${output}\n`);
      return 0;
    }
    if (
      command === "render" &&
      (args[1] === "ppt" || args[1] === "presentation")
    ) {
      const brief = option(args, "--brief");
      if (option(args, "--lesson") || option(args, "--theme")) {
        throw new KTeachError("migration-required", "PPT --lesson/--theme input is no longer supported.", "Run generate --intent ppt --brief <id> --json.");
      }
      if (!brief) {
        throw new KTeachError(
          "validation-failed",
          "--brief is required for current PPT rendering.",
          "Run generate --intent ppt --brief <id> --json first.",
        );
      }
      const workspaceRoot = await resolveTeach(args);
      await assertWorkspaceIsCurrent(workspaceRoot);
      const configRoot = await resolveProjectConfigRoot(workspaceRoot);
      const config = await resolveConfig({ cwd: configRoot, userConfigDir: userConfigDir() });
      const packet = await prepareRoutePacket(workspaceRoot, "ppt", brief);
      const plan = await loadRoutePlan(workspaceRoot, "ppt", brief);
      const output = await promoteRouteArtifact({
        root: workspaceRoot,
        outputDirectory: config.output_dir,
        intent: "ppt",
        briefId: brief,
        plan,
        packet,
      });
      process.stdout.write(`HTML PPT rendered to ${output}\n`);
      return 0;
    }
    if (command === "render" && args[1] === "diagram") {
      const input = args[2];
      if (!input) {
        throw new KTeachError(
          "validation-failed",
          "A Diagram Spec path is required.",
          "Run k-teach render diagram <spec.yaml> [--output <directory>].",
        );
      }
      const outputIndex = args.indexOf("--output");
      const output =
        outputIndex >= 0 && args[outputIndex + 1]
          ? args[outputIndex + 1]
          : path.join(process.cwd(), "main", "research", "diagrams");
      const rendered = await renderDiagram(
        path.resolve(process.cwd(), input),
        path.resolve(process.cwd(), output),
      );
      process.stdout.write(`Diagram rendered to ${rendered}\n`);
      return 0;
    }
    if (command === "visuals" && args[1] === "register") {
      const workspaceRoot = await resolveTeach(args);
      await assertWorkspaceIsCurrent(workspaceRoot);
      const planIndex = args.indexOf("--plan");
      const resultIndex = args.indexOf("--result");
      const plan = planIndex >= 0 ? args[planIndex + 1] : undefined;
      const result = resultIndex >= 0 ? args[resultIndex + 1] : undefined;
      if (!plan || !result) {
        throw new KTeachError(
          "validation-failed",
          "Both --plan and --result are required.",
          "Run k-teach visuals register --plan <plan.yaml> --result <result.yaml>.",
        );
      }
      const record = await registerVisualAsset(
        workspaceRoot,
        path.resolve(process.cwd(), plan),
        path.resolve(process.cwd(), result),
      );
      process.stdout.write(`Visual asset registered at ${record}\n`);
      return 0;
    }
    if (command === "wechat" && ["render", "render-proposals"].includes(args[1] ?? "")) {
      const workspaceRoot = await resolveTeach(args);
      await assertWorkspaceIsCurrent(workspaceRoot);
      const configRoot = await resolveProjectConfigRoot(workspaceRoot);
      const briefIndex = args.indexOf("--brief");
      const brief = briefIndex >= 0 ? args[briefIndex + 1] : undefined;
      if (!brief) {
        throw new KTeachError(
          "invalid-brief",
          "--brief is required.",
          "Run generate --intent wechat --brief <id> --json first.",
        );
      }
      const config = await resolveConfig({
        cwd: configRoot,
        userConfigDir: userConfigDir(),
      });
      const packet = await prepareRoutePacket(workspaceRoot, "wechat", brief);
      const plan = await loadRoutePlan(workspaceRoot, "wechat", brief);
      const output = await promoteRouteArtifact({
        root: workspaceRoot,
        outputDirectory: config.output_dir,
        intent: "wechat",
        briefId: brief,
        plan,
        packet,
        proposals: args[1] === "render-proposals",
      });
      process.stdout.write(`WeChat ${args[1] === "render-proposals" ? "theme proposals" : "article"} rendered to ${output}\n`);
      return 0;
    }
    if (command === "doctor" && args[1] === "wechat") {
      const workspaceRoot = await resolveTeach(args);
      const configRoot = await resolveProjectConfigRoot(workspaceRoot);
      const config = await resolveConfig({ cwd: configRoot, userConfigDir: userConfigDir() });
      const account = await resolveWechatAccountAlias(option(args, "--account"), config.wechat_account);
      const report = await doctorWechat(await publisherOptions(workspaceRoot, account));
      process.stdout.write(`${JSON.stringify(report)}\n`);
      return 0;
    }
    if (command === "wechat" && args[1] === "draft") {
      const workspaceRoot = await resolveTeach(args);
      await assertWorkspaceIsCurrent(workspaceRoot);
      const configRoot = await resolveProjectConfigRoot(workspaceRoot);
      const brief = option(args, "--brief");
      const config = await resolveConfig({ cwd: configRoot, userConfigDir: userConfigDir() });
      if (!brief) {
        throw new KTeachError(
          "validation-failed",
          "--brief is required.",
          "Run k-teach wechat draft --brief <id> --account <alias>.",
        );
      }
      const account = await resolveWechatAccountAlias(option(args, "--account"), config.wechat_account);
      const artifactDir = path.resolve(workspaceRoot, config.output_dir, "wechat", brief);
      const registered = await requireWechatAccount(account).catch(() => undefined);
      const manifest = JSON.parse(await readFile(path.join(artifactDir, "manifest.json"), "utf8")) as {
        publication_brief?: { draft_delivery?: { account_alias?: string; authorized?: boolean } };
      };
      const draftAuthorized =
        manifest.publication_brief?.draft_delivery?.authorized === true &&
        manifest.publication_brief.draft_delivery.account_alias === account;
      if (!draftAuthorized) {
        const approved = await confirmDraft(`WeChat draft\nAccount: ${account}${registered ? ` · ${registered.name} · ${maskedAppId(registered.app_id)}` : ""}\nBrief: ${brief}`);
        if (!approved) throw new KTeachError("validation-failed", "WeChat draft creation was cancelled.", "The local artifact remains unchanged; rerun when ready.");
      }
      const attempt = await createWechatDraft(
        artifactDir,
        await publisherOptions(workspaceRoot, account),
      );
      await markWechatAccountSuccessful(account);
      process.stdout.write(`WeChat draft created. Attempt: ${attempt.id}\n`);
      return 0;
    }
    if (command === "wechat" && ["preview", "publish", "status"].includes(args[1] ?? "")) {
      const workspaceRoot = await resolveTeach(args);
      const attemptId = option(args, "--attempt");
      if (!attemptId) {
        throw new KTeachError(
          "validation-failed",
          "--attempt is required.",
          `Run k-teach wechat ${args[1]} --attempt <id>.`,
        );
      }
      const stored = await readWechatAttempt(workspaceRoot, attemptId);
      const publisher = await publisherOptions(workspaceRoot, stored.account_alias);
      if (args[1] === "preview") {
        const openid = option(args, "--openid");
        if (!openid) {
          throw new KTeachError(
            "validation-failed",
            "--openid is required for a WeChat preview.",
            "Run k-teach wechat preview --attempt <id> --openid <openid>.",
          );
        }
        const attempt = await previewWechatDraft(attemptId, openid, publisher);
        process.stdout.write(`WeChat preview sent. Attempt: ${attempt.id}\n`);
        return 0;
      }
      if (args[1] === "publish") {
        if (!args.includes("--live")) {
          throw new KTeachError(
            "validation-failed",
            "Public publishing requires --live.",
            "Review the draft, then run this command interactively with --live.",
          );
        }
        const attempt = await publishWechatDraft(
          attemptId,
          publisher,
          confirmInteractivePublish,
        );
        process.stdout.write(`WeChat publish submitted. Attempt: ${attempt.id}\n`);
        return 0;
      }
      const attempt = await queryWechatStatus(attemptId, publisher);
      process.stdout.write(
        `WeChat publication state: ${attempt.state}. Attempt: ${attempt.id}\n`,
      );
      return 0;
    }
    if (command === "preview") {
      const requestedTeach = option(args, "--teach");
      const projectRoot = await resolveProjectRoot(process.cwd());
      const projectPreview =
        requestedTeach === undefined &&
        path.resolve(process.cwd()) === projectRoot;
      const workspaceRoot = projectPreview
        ? undefined
        : await resolveTeach(args);
      const configRoot = projectPreview
        ? path.join(projectRoot, ".k-teach")
        : await resolveProjectConfigRoot(workspaceRoot as string);
      const portIndex = args.indexOf("--port");
      const parsedPort =
        portIndex >= 0 ? Number(args[portIndex + 1]) : Number.NaN;
      const port = Number.isInteger(parsedPort) ? parsedPort : 4173;
      const config = await resolveConfig({
        cwd: configRoot,
        userConfigDir: userConfigDir(),
      });
      const teaches = projectPreview
        ? await listTeaches(projectRoot)
        : (await listTeaches(projectRoot)).filter(
            (teach) => teach.root === workspaceRoot,
          );
      const rendered = await Promise.all(
        teaches.map(async (teach) => {
            await assertWorkspaceIsCurrent(teach.root);
            return {
              ...teach,
              artifactRoot: config.output_dir,
              root: await promoteRouteArtifact({
                root: teach.root,
                outputDirectory: config.output_dir,
                intent: "learn",
              }),
            };
          }),
      );
      const preview = await startPreviewRuntime({
        projectRoot,
        teaches: rendered,
        host: "127.0.0.1",
        port,
        onInputChange: async (file) => {
          const affected = teaches.filter((teach) => {
            const relative = path.relative(teach.root, file);
            return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
          });
          for (const teach of affected) {
            await promoteRouteArtifact({
              root: teach.root,
              outputDirectory: config.output_dir,
              intent: "learn",
            });
            const presentationIds = await readdir(path.join(teach.root, "presentations")).then((files) => files.filter((name) => name.endsWith(".yaml")).map((name) => name.slice(0, -5)), () => []);
            for (const id of presentationIds) {
              try {
                const plan = await loadRoutePlan(teach.root, "ppt", id);
                const packet = await prepareRoutePacket(teach.root, "ppt", id);
                await promoteRouteArtifact({
                  root: teach.root,
                  outputDirectory: config.output_dir,
                  intent: "ppt",
                  briefId: id,
                  plan,
                  packet,
                });
              } catch {
                // Preview refresh skips Briefs that are not ready to promote.
              }
            }
            const publicationIds = await readdir(path.join(teach.root, "publications")).then((files) => files.filter((name) => name.endsWith(".yaml")).map((name) => name.slice(0, -5)), () => []);
            for (const id of publicationIds) {
              const proposals = path.resolve(config.output_dir, "wechat", id, "proposals.html");
              try {
                const plan = await loadRoutePlan(teach.root, "wechat", id);
                const packet = await prepareRoutePacket(teach.root, "wechat", id);
                await promoteRouteArtifact({
                  root: teach.root,
                  outputDirectory: config.output_dir,
                  intent: "wechat",
                  briefId: id,
                  plan,
                  packet,
                  proposals: await access(proposals).then(() => true, () => false),
                });
              } catch {
                // Preview refresh skips Briefs that are not ready to promote.
              }
            }
          }
        },
      });
      for (const notice of preview.notices) process.stderr.write(`${notice}\n`);
      process.stdout.write(`Preview available at ${preview.url}\n`);
      if (args.includes("--open")) openBrowser(preview.url);
      if (preview.reused) return 0;
      await Promise.race([preview.closed, new Promise<void>((resolve) => {
        const stop = () => {
          void preview.close().then(resolve);
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
      })]);
      return 0;
    }

    throw new KTeachError(
      "validation-failed",
      command ? `Unknown command: ${command}` : "A command is required.",
      "Run k-teach capabilities to inspect the supported commands.",
    );
  } catch (error) {
    if (error instanceof KTeachError) {
      writeError(error);
      return 2;
    }
    if (
      error instanceof Error &&
      (error.name === "ExitPromptError" ||
        error.name === "AbortError" ||
        error.message.includes("force closed the prompt with SIGINT"))
    ) {
      process.stderr.write("Cancelled.\n");
      return 130;
    }
    throw error;
  }
}
