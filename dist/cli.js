import path from "node:path";

import { KTeachError } from "./errors.js";
import { resolveConfig } from "./config.js";
import { validateLessonBundles } from "./lesson-bundle.js";
import { startPreviewServer } from "./preview-server.js";
import { renderWeb } from "./web-renderer.js";
import { renderDiagram } from "./diagram-renderer.js";
import { registerVisualAsset } from "./visuals.js";
import { renderWechat } from "./wechat-renderer.js";
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
  initializeWorkspace,
  previewLegacyMigration,
} from "./workspace.js";

const CAPABILITIES = {
  core: ["lesson-bundle", "web", "diagram"],
  optional: ["visual-provider", "wechat"],
  visual_modes: ["auto", "required", "off"],
}         ;

function writeError(error             )       {
  process.stderr.write(
    `${error.code}: ${error.message}\nNext action: ${error.nextAction}\n`,
  );
}

function option(args          , name        )                     {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function publisherOptions(
  cwd        ,
  accountAlias        ,
)                         {
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

export async function main(args          )                  {
  try {
    const [command] = args;
    if (command === "init") {
      await initializeWorkspace(process.cwd());
      process.stdout.write("Learning Workspace created.\n");
      return 0;
    }
    if (command === "capabilities") {
      process.stdout.write(`${JSON.stringify(CAPABILITIES)}\n`);
      return 0;
    }
    if (command === "validate") {
      await assertWorkspaceIsCurrent(process.cwd());
      const userConfigDir =
        process.env.XDG_CONFIG_HOME ??
        `${process.env.HOME ?? process.cwd()}/.config/k-teach`;
      await resolveConfig({ cwd: process.cwd(), userConfigDir });
      await validateLessonBundles(process.cwd());
      process.stdout.write("Learning Workspace is valid.\n");
      return 0;
    }
    if (command === "migrate" && args.includes("--dry-run")) {
      const changes = await previewLegacyMigration(process.cwd());
      process.stdout.write(
        `Legacy migration preview (no files changed):\n${changes
          .map((change) => `- ${change}`)
          .join("\n")}\n`,
      );
      return 0;
    }
    if (command === "render" && args[1] === "web") {
      await assertWorkspaceIsCurrent(process.cwd());
      const userConfigDir =
        process.env.XDG_CONFIG_HOME ??
        `${process.env.HOME ?? process.cwd()}/.config/k-teach`;
      const config = await resolveConfig({
        cwd: process.cwd(),
        userConfigDir,
      });
      const output = await renderWeb(process.cwd(), config.output_dir);
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
      await assertWorkspaceIsCurrent(process.cwd());
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
        process.cwd(),
        path.resolve(process.cwd(), plan),
        path.resolve(process.cwd(), result),
      );
      process.stdout.write(`Visual asset registered at ${record}\n`);
      return 0;
    }
    if (command === "wechat" && args[1] === "render") {
      await assertWorkspaceIsCurrent(process.cwd());
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
        cwd: process.cwd(),
        userConfigDir,
      });
      const output = await renderWechat(
        process.cwd(),
        brief,
        config.output_dir,
      );
      process.stdout.write(`WeChat article rendered to ${output}\n`);
      return 0;
    }
    if (command === "doctor" && args[1] === "wechat") {
      const userConfigDir =
        process.env.XDG_CONFIG_HOME ??
        `${process.env.HOME ?? process.cwd()}/.config/k-teach`;
      const config = await resolveConfig({ cwd: process.cwd(), userConfigDir });
      const account = option(args, "--account") ?? config.wechat_account;
      if (!account) {
        throw new KTeachError(
          "credential-missing",
          "A WeChat account alias is required.",
          "Pass --account <alias> or set wechat_account in k-teach.yaml.",
        );
      }
      const report = await doctorWechat(publisherOptions(process.cwd(), account));
      process.stdout.write(`${JSON.stringify(report)}\n`);
      return 0;
    }
    if (command === "wechat" && args[1] === "draft") {
      await assertWorkspaceIsCurrent(process.cwd());
      const brief = option(args, "--brief");
      const userConfigDir =
        process.env.XDG_CONFIG_HOME ??
        `${process.env.HOME ?? process.cwd()}/.config/k-teach`;
      const config = await resolveConfig({ cwd: process.cwd(), userConfigDir });
      const account = option(args, "--account") ?? config.wechat_account;
      if (!brief || !account) {
        throw new KTeachError(
          "validation-failed",
          "Both --brief and a WeChat account alias are required.",
          "Run k-teach wechat draft --brief <id> --account <alias>.",
        );
      }
      const artifactDir = path.resolve(process.cwd(), config.output_dir, "wechat", brief);
      const attempt = await createWechatDraft(
        artifactDir,
        publisherOptions(process.cwd(), account),
      );
      process.stdout.write(`WeChat draft created. Attempt: ${attempt.id}\n`);
      return 0;
    }
    if (command === "wechat" && ["preview", "publish", "status"].includes(args[1] ?? "")) {
      const attemptId = option(args, "--attempt");
      if (!attemptId) {
        throw new KTeachError(
          "validation-failed",
          "--attempt is required.",
          `Run k-teach wechat ${args[1]} --attempt <id>.`,
        );
      }
      const stored = await readWechatAttempt(process.cwd(), attemptId);
      const publisher = publisherOptions(process.cwd(), stored.account_alias);
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
      const portIndex = args.indexOf("--port");
      const parsedPort =
        portIndex >= 0 ? Number(args[portIndex + 1]) : Number.NaN;
      const port = Number.isInteger(parsedPort) ? parsedPort : 4173;
      const userConfigDir =
        process.env.XDG_CONFIG_HOME ??
        `${process.env.HOME ?? process.cwd()}/.config/k-teach`;
      const config = await resolveConfig({
        cwd: process.cwd(),
        userConfigDir,
      });
      const output = await renderWeb(process.cwd(), config.output_dir);
      const preview = await startPreviewServer(output, {
        host: "127.0.0.1",
        port,
      });
      process.stdout.write(`Preview available at ${preview.url}\n`);
      await new Promise      ((resolve) => {
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
    throw error;
  }
}


//# sourceURL=k-teach/src/cli.ts