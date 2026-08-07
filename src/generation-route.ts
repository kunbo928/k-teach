import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

import { stageAndPromoteArtifact } from "./artifact-pipeline.ts";
import { createContextPacket } from "./context-packet.ts";
import type { ContextPacket, GenerationRunResult, OutputIntent } from "./domain.ts";
import { KTeachError } from "./errors.ts";
import {
  GenerationAttentionRequired,
  runGeneration,
} from "./generation-run.ts";
import { renderPptFromBrief } from "./ppt-renderer.ts";
import {
  loadSemanticPlan,
  type SemanticPlan,
} from "./semantic-plan.ts";
import { renderWeb } from "./web-renderer.ts";
import {
  createOrReuseAuthorizedWechatDraft,
  type WechatPublisherOptions,
  WechatDraftAttentionRequired,
} from "./wechat-publisher.ts";
import { renderWechat, renderWechatProposals } from "./wechat-renderer.ts";

export interface DraftDeliveryHooks {
  resolvePublisher: (accountAlias: string) => Promise<WechatPublisherOptions>;
  markAccountSuccessful: (accountAlias: string) => Promise<void>;
}

export interface GenerationRouteOptions {
  root: string;
  intent: OutputIntent;
  lessonId?: string;
  briefId?: string;
  version: string;
  outputDirectory: string;
  deliveryMode?: "draft";
  draftDelivery?: DraftDeliveryHooks;
}

export interface PromoteRouteArtifactOptions {
  root: string;
  outputDirectory: string;
  intent: OutputIntent;
  lessonId?: string;
  briefId?: string;
  plan?: SemanticPlan;
  packet?: ContextPacket;
  proposals?: boolean;
}

async function validateStagedArtifact(
  output: string,
  manifestName: string,
): Promise<void> {
  const manifest = JSON.parse(
    await readFile(path.join(output, manifestName), "utf8"),
  ) as { id?: string; files?: string[] };
  if (!manifest.id || !Array.isArray(manifest.files)) {
    throw new KTeachError(
      "render-failed",
      "Artifact manifest is incomplete.",
      "Correct the route renderer contract.",
    );
  }
  for (const file of manifest.files) await access(path.join(output, file));
}

async function readManifestId(
  artifactDirectory: string,
  manifestName: string,
): Promise<string> {
  const manifest = JSON.parse(
    await readFile(path.join(artifactDirectory, manifestName), "utf8"),
  ) as { id: string };
  return manifest.id;
}

async function resolveBriefLessonId(
  root: string,
  intent: "ppt" | "wechat",
  briefId: string,
): Promise<string> {
  const directory = intent === "ppt" ? "presentations" : "publications";
  const brief = parse(
    await readFile(path.join(root, directory, `${briefId}.yaml`), "utf8"),
  ) as { lesson_id?: string };
  if (!brief.lesson_id) {
    throw new KTeachError(
      "validation-failed",
      "The Route Brief is missing lesson_id.",
      "Correct the Brief and retry.",
    );
  }
  return brief.lesson_id;
}

export async function promoteRouteArtifact(
  options: PromoteRouteArtifactOptions,
): Promise<string> {
  if (options.intent === "learn") {
    return stageAndPromoteArtifact({
      root: options.root,
      outputDirectory: options.outputDirectory,
      relativeArtifact: "web",
      render: (staging) =>
        renderWeb(options.root, staging, { lessonId: options.lessonId }),
      validate: (staged) => validateStagedArtifact(staged, "artifact-manifest.json"),
    });
  }

  if (!options.briefId) {
    throw new KTeachError(
      "validation-failed",
      "A Route Brief id is required for this Output Intent.",
      "Pass --brief <id>.",
    );
  }
  if (!options.plan || !options.packet) {
    throw new KTeachError(
      "validation-failed",
      "A current semantic Plan and Context Packet are required.",
      "Run generate for this Brief, review the Plan, then retry.",
    );
  }

  if (options.intent === "ppt") {
    if (options.plan.kind !== "slide") {
      throw new KTeachError(
        "validation-failed",
        "A current Slide Plan is required.",
        "Review the generated Plan and rerun.",
      );
    }
    const plan = options.plan;
    const packet = options.packet;
    const briefId = options.briefId;
    return stageAndPromoteArtifact({
      root: options.root,
      outputDirectory: options.outputDirectory,
      relativeArtifact: path.join("ppt", briefId),
      render: (staging) =>
        renderPptFromBrief(options.root, briefId, staging, plan, packet),
      validate: (staged) => validateStagedArtifact(staged, "manifest.json"),
    });
  }

  if (options.plan.kind !== "article") {
    throw new KTeachError(
      "validation-failed",
      "A current Article Plan is required.",
      "Review the generated Plan and rerun.",
    );
  }
  const plan = options.plan;
  const packet = options.packet;
  const briefId = options.briefId;
  return stageAndPromoteArtifact({
    root: options.root,
    outputDirectory: options.outputDirectory,
    relativeArtifact: path.join("wechat", briefId),
    render: (staging) =>
      options.proposals
        ? renderWechatProposals(options.root, briefId, staging, plan, packet)
        : renderWechat(options.root, briefId, staging, { plan, packet }),
    validate: (staged) => validateStagedArtifact(staged, "manifest.json"),
  });
}

async function renderArtifactId(
  options: GenerationRouteOptions,
  packet: ContextPacket,
  plan: SemanticPlan | undefined,
): Promise<string> {
  if (options.intent === "learn") {
    const output = await promoteRouteArtifact({
      root: options.root,
      outputDirectory: options.outputDirectory,
      intent: "learn",
      lessonId: options.lessonId,
    });
    return readManifestId(output, "artifact-manifest.json");
  }

  if (options.intent === "ppt") {
    if (!plan || plan.kind !== "slide") {
      throw new KTeachError(
        "validation-failed",
        "A current Slide Plan is required.",
        "Review the generated Plan and rerun.",
      );
    }
    const output = await promoteRouteArtifact({
      root: options.root,
      outputDirectory: options.outputDirectory,
      intent: "ppt",
      briefId: options.briefId,
      plan,
      packet,
    });
    return readManifestId(output, "manifest.json");
  }

  if (!plan || plan.kind !== "article") {
    throw new KTeachError(
      "validation-failed",
      "A current Article Plan is required.",
      "Review the generated Plan and rerun.",
    );
  }
  const output = await promoteRouteArtifact({
    root: options.root,
    outputDirectory: options.outputDirectory,
    intent: "wechat",
    briefId: options.briefId,
    plan,
    packet,
  });
  return readManifestId(output, "manifest.json");
}

async function deliverAuthorizedDraft(
  options: GenerationRouteOptions,
): Promise<string> {
  if (!options.draftDelivery) {
    throw new Error("draft adapter is unavailable");
  }
  if (!options.briefId) {
    throw new KTeachError(
      "validation-failed",
      "A Publication Brief id is required for draft delivery.",
      "Pass --brief <id>.",
    );
  }
  const artifactDir = path.resolve(
    options.root,
    options.outputDirectory,
    "wechat",
    options.briefId,
  );
  const manifest = JSON.parse(
    await readFile(path.join(artifactDir, "manifest.json"), "utf8"),
  ) as {
    publication_brief?: {
      draft_delivery?: { account_alias?: string; authorized?: boolean };
    };
  };
  const authorization = manifest.publication_brief?.draft_delivery;
  if (authorization?.authorized !== true || !authorization.account_alias) {
    throw new KTeachError(
      "validation-failed",
      "The current Publication Brief has no account-scoped draft authorization.",
      "Add draft_delivery authorization or omit --draft.",
    );
  }
  try {
    const attempt = await createOrReuseAuthorizedWechatDraft(
      artifactDir,
      await options.draftDelivery.resolvePublisher(authorization.account_alias),
    );
    await options.draftDelivery.markAccountSuccessful(authorization.account_alias);
    return attempt.id;
  } catch (error) {
    if (error instanceof WechatDraftAttentionRequired) {
      throw new GenerationAttentionRequired(error.attemptId);
    }
    throw error;
  }
}

export async function runGenerationRoute(
  options: GenerationRouteOptions,
): Promise<GenerationRunResult> {
  if (options.deliveryMode === "draft" && options.intent !== "wechat") {
    throw new KTeachError(
      "validation-failed",
      "--draft is supported only for the WeChat intent.",
      "Remove --draft or use --intent wechat.",
    );
  }

  let lessonId = options.lessonId;
  return runGeneration({
    root: options.root,
    intent: options.intent,
    lessonId,
    briefId: options.briefId,
    version: options.version,
    deliveryMode: options.deliveryMode,
    createContext: async () => {
      if (options.intent !== "learn" && options.briefId) {
        lessonId = await resolveBriefLessonId(
          options.root,
          options.intent,
          options.briefId,
        );
      }
      return createContextPacket(
        options.root,
        options.intent,
        lessonId!,
        options.briefId,
      );
    },
    render: (packet, plan) => renderArtifactId(options, packet, plan),
    deliver:
      options.deliveryMode === "draft"
        ? () => deliverAuthorizedDraft(options)
        : undefined,
  });
}

export async function loadRoutePlan(
  root: string,
  intent: "ppt" | "wechat",
  briefId: string,
): Promise<SemanticPlan> {
  const kind = intent === "ppt" ? "slide" : "article";
  const plan = await loadSemanticPlan(root, kind, briefId);
  if (!plan || plan.kind !== kind) {
    throw new KTeachError(
      "validation-failed",
      intent === "ppt"
        ? "No current Slide Plan exists for this Brief."
        : "No current Article Plan exists for this Brief.",
      `Run generate --intent ${intent} --brief <id> --json and review the scaffold.`,
    );
  }
  return plan;
}

export async function prepareRoutePacket(
  root: string,
  intent: "ppt" | "wechat",
  briefId: string,
): Promise<ContextPacket> {
  const lessonId = await resolveBriefLessonId(root, intent, briefId);
  return createContextPacket(root, intent, lessonId, briefId);
}
