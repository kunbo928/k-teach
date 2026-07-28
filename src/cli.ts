import path from "node:path";
import { stdin, stdout } from "node:process";

import { KTeachError } from "./errors.ts";
import { resolveConfig } from "./config.ts";
import { validateLessonBundles } from "./lesson-bundle.ts";
import {
  startPreviewServer,
  startProjectPreviewServer,
} from "./preview-server.ts";
import { renderWeb } from "./web-renderer.ts";
import { renderDiagram } from "./diagram-renderer.ts";
import { registerVisualAsset } from "./visuals.ts";
import { renderWechat } from "./wechat-renderer.ts";
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

export const CLI_VERSION = "0.2.0";

async function chooseTools(
  projectRoot: string,
  toolsValue: string | undefined,
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
  core: ["lesson-bundle", "web", "diagram"],
  optional: ["visual-provider", "wechat"],
  visual_modes: ["auto", "required", "off"],
} as const;

function writeError(error: KTeachError): void {
  process.stderr.write(
    `${error.code}: ${error.message}\nNext action: ${error.nextAction}\n`,
  );
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

async function resolveTeach(args: string[]): Promise<string> {
  return resolveWorkspaceRoot(process.cwd(), option(args, "--teach"));
}

function publisherOptions(
  cwd: string,
  accountAlias: string,
): WechatPublisherOptions {
  return {
    cwd,
    accountAlias,
    credentials: resolveWechatCredentials(accountAlias),
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
    if (command === "wechat" && args[1] === "render") {
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
      const output = await renderWechat(
        workspaceRoot,
        brief,
        config.output_dir,
      );
      process.stdout.write(`WeChat article rendered to ${output}\n`);
      return 0;
    }
    if (command === "doctor" && args[1] === "wechat") {
      const workspaceRoot = await resolveTeach(args);
      const configRoot = await resolveProjectConfigRoot(workspaceRoot);
      const userConfigDir =
        process.env.XDG_CONFIG_HOME ??
        `${process.env.HOME ?? process.cwd()}/.config/k-teach`;
      const config = await resolveConfig({ cwd: configRoot, userConfigDir });
      const account = option(args, "--account") ?? config.wechat_account;
      if (!account) {
        throw new KTeachError(
          "credential-missing",
          "A WeChat account alias is required.",
          "Pass --account <alias> or set wechat_account in k-teach/config.yaml.",
        );
      }
      const report = await doctorWechat(publisherOptions(workspaceRoot, account));
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
      const account = option(args, "--account") ?? config.wechat_account;
      if (!brief || !account) {
        throw new KTeachError(
          "validation-failed",
          "Both --brief and a WeChat account alias are required.",
          "Run k-teach wechat draft --brief <id> --account <alias>.",
        );
      }
      const artifactDir = path.resolve(workspaceRoot, config.output_dir, "wechat", brief);
      const attempt = await createWechatDraft(
        artifactDir,
        publisherOptions(workspaceRoot, account),
      );
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
      const publisher = publisherOptions(workspaceRoot, stored.account_alias);
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
      const userConfigDir =
        process.env.XDG_CONFIG_HOME ??
        `${process.env.HOME ?? process.cwd()}/.config/k-teach`;
      const config = await resolveConfig({
        cwd: configRoot,
        userConfigDir,
      });
      let preview;
      if (projectPreview) {
        const teaches = await listTeaches(projectRoot);
        const rendered = await Promise.all(
          teaches.map(async (teach) => {
            await assertWorkspaceIsCurrent(teach.root);
            return {
              ...teach,
              root: await renderWeb(teach.root, config.output_dir),
            };
          }),
        );
        preview = await startProjectPreviewServer(rendered, {
          host: "127.0.0.1",
          port,
        });
      } else {
        const output = await renderWeb(workspaceRoot as string, config.output_dir);
        preview = await startPreviewServer(output, {
          host: "127.0.0.1",
          port,
        });
      }
      process.stdout.write(`Preview available at ${preview.url}\n`);
      await new Promise<void>((resolve) => {
        const stop = () => {
          void preview.close().then(resolve);
        };
        process.once("SIGINT", stop);
        process.once("SIGTERM", stop);
      });
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
