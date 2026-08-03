import path from "node:path";
import { spawn } from "node:child_process";
import { access, readFile, readdir } from "node:fs/promises";
import { stdin, stdout } from "node:process";

import { KTeachError } from "./errors.js";
import { resolveConfig } from "./config.js";
import { validateLessonBundles } from "./lesson-bundle.js";
import { startPreviewRuntime } from "./preview-runtime.js";
import { renderWeb } from "./web-renderer.js";
import { renderDiagram } from "./diagram-renderer.js";
import { registerVisualAsset } from "./visuals.js";
import { renderWechat, renderWechatProposals } from "./wechat-renderer.js";
import { renderPpt, renderPptFromBrief } from "./ppt-renderer.js";
import {
  confirmInteractivePublish,
  createWechatDraft,
  doctorWechat,
  previewWechatDraft,
  publishWechatDraft,
  queryWechatStatus,
  readWechatAttempt,
  resolveWechatCredentials,

} from "./wechat-publisher.js";
import {
  assertWorkspaceIsCurrent,
  initializeTeach,
  initializeWorkspace,
  listTeaches,
  resolveProjectConfigRoot,
  resolveProjectRoot,
  resolveWorkspaceRoot,
} from "./workspace.js";
import {
  AGENT_TOOLS,
  configuredTools,
  detectedTools,
  installAgentIntegrations,
  selectTools,
} from "./agent-integration.js";
import { searchableMultiSelect } from "./searchable-multi-select.js";
import { TEACHING_THEME_IDS } from "./teaching-themes.js";
import { addWechatAccount, markWechatAccountSuccessful, maskedAppId, readWechatAccounts, requireWechatAccount } from "./wechat-accounts.js";

export const CLI_VERSION = "0.4.0";

async function chooseTools(
  projectRoot        ,
  toolsValue                    ,
) {
  if (toolsValue !== undefined) return selectTools(toolsValue);
  const detected = await detectedTools(projectRoot);
  if (!stdin.isTTY || !stdout.isTTY) {
    if (detected.length > 0) return detected;
    throw new KTeachError(
      "validation-failed",
      "No Agent tools were detected.",
      "Pass --tools all, --tools none, or a comma-separated tool list.",
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
  core: ["lesson-bundle", "web", "diagram", "presentation-brief", "ppt", "vite-project-preview"],
  optional: ["visual-provider", "wechat", "wechat-channel-themes", "wechat-multi-account"],
  visual_modes: ["auto", "required", "off"],
  teaching_themes: TEACHING_THEME_IDS,
}         ;

async function resolveWechatAccountAlias(explicit                    , preferred         )                  {
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

async function confirmDraft(summary        )                   {
  if (!stdin.isTTY || !stdout.isTTY) throw new KTeachError("validation-failed", "Creating a WeChat draft requires an interactive confirmation.", "Run the command in an interactive terminal after reviewing the account summary.");
  const reader = (await import("node:readline/promises")).createInterface({ input: stdin, output: stdout });
  try {
    return (await reader.question(`${summary}\nCreate this remote draft? [y/N] `)).trim().toLowerCase() === "y";
  } finally { reader.close(); }
}

function writeError(error             )       {
  process.stderr.write(
    `${error.code}: ${error.message}\nNext action: ${error.nextAction}\n`,
  );
}

function option(args          , name        )                     {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function openBrowser(url        )       {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const commandArgs = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, commandArgs, { detached: true, stdio: "ignore" });
  child.unref();
}

async function resolveTeach(args          )                  {
  return resolveWorkspaceRoot(process.cwd(), option(args, "--teach"));
}

async function publisherOptions(
  cwd        ,
  accountAlias        ,
)                                  {
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

export async function main(args          )                  {
  try {
    const [command] = args;
    if (command === "init") {
      const targetArg = args[1]?.startsWith("-") ? undefined : args[1];
      const projectRoot = path.resolve(process.cwd(), targetArg ?? ".");
      const toolsValue = option(args, "--tools");
      const tools = await chooseTools(projectRoot, toolsValue);
      await initializeWorkspace(projectRoot, option(args, "--teach") ?? "main");
      await installAgentIntegrations(projectRoot, tools, CLI_VERSION);
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
      await installAgentIntegrations(projectRoot, tools, CLI_VERSION);
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
      const userConfigDir =
        process.env.XDG_CONFIG_HOME ??
        `${process.env.HOME ?? process.cwd()}/.config/k-teach`;
      await resolveConfig({ cwd: configRoot, userConfigDir });
      await validateLessonBundles(workspaceRoot);
      process.stdout.write("Teach is valid.\n");
      return 0;
    }
    if (command === "render" && args[1] === "web") {
      const workspaceRoot = await resolveTeach(args);
      await assertWorkspaceIsCurrent(workspaceRoot);
      const configRoot = await resolveProjectConfigRoot(workspaceRoot);
      const userConfigDir =
        process.env.XDG_CONFIG_HOME ??
        `${process.env.HOME ?? process.cwd()}/.config/k-teach`;
      const config = await resolveConfig({
        cwd: configRoot,
        userConfigDir,
      });
      const output = await renderWeb(workspaceRoot, config.output_dir);
      process.stdout.write(`Web course rendered to ${output}\n`);
      return 0;
    }
    if (
      command === "render" &&
      (args[1] === "ppt" || args[1] === "presentation")
    ) {
      const lesson = option(args, "--lesson");
      const brief = option(args, "--brief");
      if (!lesson && !brief) {
        throw new KTeachError(
          "validation-failed",
          "--brief is required for Presentation Brief rendering (legacy --lesson remains supported).",
          "Run k-teach render ppt --brief <presentation-brief-id>.",
        );
      }
      const workspaceRoot = await resolveTeach(args);
      await assertWorkspaceIsCurrent(workspaceRoot);
      const configRoot = await resolveProjectConfigRoot(workspaceRoot);
      const userConfigDir =
        process.env.XDG_CONFIG_HOME ??
        `${process.env.HOME ?? process.cwd()}/.config/k-teach`;
      const config = await resolveConfig({ cwd: configRoot, userConfigDir });
      const output = brief
        ? await renderPptFromBrief(workspaceRoot, brief, config.output_dir)
        : await renderPpt(workspaceRoot, lesson          , config.output_dir, option(args, "--theme"));
      if (!brief) process.stderr.write("Migration notice: --lesson/--theme is a compatibility path; create a Presentation Brief and use --brief.\n");
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
          : path.join(process.cwd(), ".k-teach", "output", "diagrams");
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
          "Run k-teach wechat render --brief <id>.",
        );
      }
      const userConfigDir =
        process.env.XDG_CONFIG_HOME ??
        `${process.env.HOME ?? process.cwd()}/.config/k-teach`;
      const config = await resolveConfig({
        cwd: configRoot,
        userConfigDir,
      });
      const output = args[1] === "render-proposals"
        ? await renderWechatProposals(workspaceRoot, brief, config.output_dir)
        : await renderWechat(workspaceRoot, brief, config.output_dir);
      process.stdout.write(`WeChat ${args[1] === "render-proposals" ? "theme proposals" : "article"} rendered to ${output}\n`);
      return 0;
    }
    if (command === "doctor" && args[1] === "wechat") {
      const workspaceRoot = await resolveTeach(args);
      const configRoot = await resolveProjectConfigRoot(workspaceRoot);
      const userConfigDir =
        process.env.XDG_CONFIG_HOME ??
        `${process.env.HOME ?? process.cwd()}/.config/k-teach`;
      const config = await resolveConfig({ cwd: configRoot, userConfigDir });
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
      const userConfigDir =
        process.env.XDG_CONFIG_HOME ??
        `${process.env.HOME ?? process.cwd()}/.config/k-teach`;
      const config = await resolveConfig({ cwd: configRoot, userConfigDir });
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
      const manifest = JSON.parse(await readFile(path.join(artifactDir, "manifest.json"), "utf8"))

       ;
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
        : await resolveProjectConfigRoot(workspaceRoot          );
      const portIndex = args.indexOf("--port");
      const parsedPort =
        portIndex >= 0 ? Number(args[portIndex + 1]) : Number.NaN;
      const port = Number.isInteger(parsedPort) ? parsedPort : 4173;
      const userConfigDir =
        process.env.XDG_CONFIG_HOME ??
        `${process.env.HOME ?? process.cwd()}/.config/k-teach`;
      const config = await resolveConfig({
        cwd: configRoot,
        userConfigDir,
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
              artifactRoot: path.resolve(teach.root, config.output_dir),
              root: await renderWeb(teach.root, config.output_dir),
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
            await renderWeb(teach.root, config.output_dir);
            const presentationIds = await readdir(path.join(teach.root, "presentations")).then((files) => files.filter((name) => name.endsWith(".yaml")).map((name) => name.slice(0, -5)), () => []);
            for (const id of presentationIds) await renderPptFromBrief(teach.root, id, config.output_dir);
            const publicationIds = await readdir(path.join(teach.root, "publications")).then((files) => files.filter((name) => name.endsWith(".yaml")).map((name) => name.slice(0, -5)), () => []);
            for (const id of publicationIds) {
              const proposals = path.resolve(teach.root, config.output_dir, "wechat", id, "proposals.html");
              if (await access(proposals).then(() => true, () => false)) await renderWechatProposals(teach.root, id, config.output_dir);
              else await renderWechat(teach.root, id, config.output_dir);
            }
          }
        },
      });
      for (const notice of preview.notices) process.stderr.write(`${notice}\n`);
      process.stdout.write(`Preview available at ${preview.url}\n`);
      if (args.includes("--open")) openBrowser(preview.url);
      if (preview.reused) return 0;
      await Promise.race([preview.closed, new Promise      ((resolve) => {
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


//# sourceURL=k-teach/src/cli.ts