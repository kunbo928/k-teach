import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ContextPacket, GenerationRunResult, OutputIntent } from "./domain.ts";
import {
  loadSemanticPlan,
  loadPlanContextSnapshot,
  rebaseSemanticPlan,
  savePlanContextSnapshot,
  savePlanReviewDelta,
  saveSemanticPlan,
  scaffoldSemanticPlan,
  validateSemanticPlan,
  type SemanticPlan,
} from "./semantic-plan.ts";
import { validateDocument } from "./schema.ts";
import { readContentCache, writeContentCache } from "./content-cache.ts";
import { KTeachError } from "./errors.ts";

export interface GenerationRunOptions {
  root: string;
  intent: OutputIntent;
  lessonId?: string;
  briefId?: string;
  version: string;
  createContext: () => Promise<ContextPacket>;
  render: (packet: ContextPacket, plan: SemanticPlan | undefined) => Promise<string>;
  deliveryMode?: "draft";
  deliver?: (artifactRef: string) => Promise<string>;
}

export class GenerationAttentionRequired extends Error {
  readonly attemptRef: string;
  readonly actionCode: string;

  constructor(attemptRef: string, actionCode = "inspect-publication-attempt") {
    super("Generation requires explicit recovery inspection.");
    this.attemptRef = attemptRef;
    this.actionCode = actionCode;
  }
}

function hash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function result(
  intent: OutputIntent,
  inputHash: string,
  state: GenerationRunResult["state"],
  code: string | null,
  fields: string[],
  refs: Partial<GenerationRunResult["refs"]> = {},
): GenerationRunResult {
  return {
    schema_version: 1,
    run_id: `run-${hash([intent, inputHash]).slice(0, 16)}`,
    state,
    intent,
    input_hash: inputHash,
    next_action: { code, fields },
    refs: {
      context_packet: null,
      route_brief: null,
      plan: null,
      artifact: null,
      publication_attempt: null,
      ...refs,
    },
    warnings: [],
  };
}

async function persist(root: string, value: GenerationRunResult): Promise<void> {
  const directory = path.join(root, ".k-teach", "runs");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, `${value.run_id}.json`), `${JSON.stringify(value)}\n`);
}

async function cached(root: string, runId: string, inputHash: string, version: string): Promise<GenerationRunResult | undefined> {
  try {
    const verified = await readContentCache<GenerationRunResult>(root, "generation-run", inputHash, version);
    if (!verified || verified.run_id !== runId || verified.state !== "complete") return undefined;
    const value = JSON.parse(await readFile(path.join(root, ".k-teach", "runs", `${runId}.json`), "utf8")) as GenerationRunResult;
    return JSON.stringify(value) === JSON.stringify(verified) ? value : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function runGeneration(options: GenerationRunOptions): Promise<GenerationRunResult> {
  const missing = options.intent === "learn"
    ? options.lessonId ? [] : ["lesson"]
    : options.briefId ? [] : ["brief"];
  const selectorHash = hash([options.intent, options.lessonId ?? null, options.briefId ?? null, options.version, options.deliveryMode ?? null]);
  if (missing.length) return result(options.intent, selectorHash, "needs_input", "provide-input", missing);
  try {
    const packet = await options.createContext();
    await writeContentCache(options.root, "context", packet.provenance.input_hash, options.version, [packet.packet_id], packet);
    await writeContentCache(options.root, "media", hash(packet.assets), options.version, packet.assets.map((asset) => asset.id), packet.assets);
    const kind = options.intent === "ppt" ? "slide" : "article";
    let plan: SemanticPlan | undefined;
    if (options.intent !== "learn") {
      plan = await loadSemanticPlan(options.root, kind, options.briefId!);
      if (!plan) {
        plan = scaffoldSemanticPlan(packet);
        await saveSemanticPlan(options.root, plan);
        await savePlanContextSnapshot(options.root, plan, packet);
        await writeContentCache(options.root, "plan", hash(plan), options.version, [plan.id], plan);
        const pending = result(options.intent, hash([packet.provenance.input_hash, null, options.version]), "needs_plan", "review-plan", [], {
          context_packet: packet.packet_id,
          route_brief: options.briefId!,
          plan: plan.id,
        });
        await persist(options.root, pending);
        return pending;
      }
      const errors = await validateSemanticPlan(plan, packet);
      await writeContentCache(options.root, "plan", hash(plan), options.version, [plan.id], plan);
      if (errors.length) {
        const previous = await loadPlanContextSnapshot(options.root, plan);
        if (previous) await savePlanReviewDelta(options.root, plan, rebaseSemanticPlan(plan, previous, packet));
        const pending = result(options.intent, hash([packet.provenance.input_hash, plan, options.version]), "needs_plan", "review-stale-plan", [], {
          context_packet: packet.packet_id,
          route_brief: options.briefId!,
          plan: plan.id,
        });
        pending.warnings = errors.map(() => "plan-review-required");
        await persist(options.root, pending);
        return pending;
      }
    }
    const inputHash = hash([packet.provenance.input_hash, plan ?? null, options.version, options.deliveryMode ?? null]);
    const candidate = result(options.intent, inputHash, "complete", null, [], {
      context_packet: packet.packet_id,
      route_brief: options.briefId ?? null,
      plan: plan?.id ?? null,
    });
    const reused = await cached(options.root, candidate.run_id, inputHash, options.version);
    if (reused) return reused;
    candidate.refs.artifact = await options.render(packet, plan);
    await writeContentCache(options.root, "artifact", inputHash, options.version, [candidate.refs.artifact], { artifact: candidate.refs.artifact });
    const errors = await validateDocument("generation-run-result", candidate);
    if (errors.length) throw new Error("invalid generation result");
    if (options.deliveryMode === "draft") {
      if (!options.deliver) throw new Error("draft adapter is unavailable");
      candidate.refs.publication_attempt = await options.deliver(candidate.refs.artifact);
    }
    await persist(options.root, candidate);
    await writeContentCache(options.root, "generation-run", inputHash, options.version, [candidate.run_id], candidate);
    return candidate;
  } catch (error) {
    if (error instanceof GenerationAttentionRequired) {
      const attention = result(options.intent, selectorHash, "attention_required", error.actionCode, [], {
        publication_attempt: error.attemptRef,
      });
      attention.error = { code: "remote-unknown", fields: [], refs: [error.attemptRef] };
      await persist(options.root, attention).catch(() => undefined);
      return attention;
    }
    const failed = result(options.intent, selectorHash, "failed", "inspect-error", []);
    failed.error = { code: error instanceof KTeachError ? error.code : "internal-error", fields: [], refs: [] };
    await persist(options.root, failed).catch(() => undefined);
    return failed;
  }
}
