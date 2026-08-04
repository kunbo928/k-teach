import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { GenerationAttentionRequired, runGeneration } from "../dist/generation-run.js";

const context = {
  schema_version: 1, packet_id: "ctx-a", intent: "wechat",
  teach: { id: "main", title: "课程" }, lesson: { id: "lesson", revision: "r1", title: "标题", mission: "任务", objectives: ["目标"] },
  sections: [{ id: "s1", heading: "观察", blocks: [{ id: "b1", kind: "paragraph", body: "观察。", asset_ids: [] }] }],
  sources: [], assets: [], route: { id: "brief", revision: "br1" },
  diagnostics: { missing_fields: [], blockers: [], warnings: [] },
  provenance: { input_hash: "a".repeat(64), planning_hash: "b".repeat(64), lesson_revision: "r1", brief_revision: "br1" },
};

test("run moves from needs_plan to complete and reuses completed result", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "k-teach-run-"));
  let renders = 0;
  const options = {
    root, intent: "wechat", lessonId: "lesson", briefId: "brief", version: "test",
    createContext: async () => structuredClone(context),
    render: async () => { renders += 1; return "artifact-a"; },
  };
  const first = await runGeneration(options);
  assert.equal(first.state, "needs_plan");
  assert.equal(first.next_action.code, "review-plan");
  assert.ok(first.refs.plan);
  assert.equal(renders, 0);

  const second = await runGeneration(options);
  assert.equal(second.state, "complete");
  assert.equal(second.refs.artifact, "artifact-a");
  assert.equal(renders, 1);
  const third = await runGeneration(options);
  assert.deepEqual(third, second);
  assert.equal(renders, 1);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, ".k-teach", "runs", `${second.run_id}.json`), "utf8")), second);
});

test("run reports only material missing selector fields", async () => {
  const result = await runGeneration({ root: "/unused", intent: "ppt", version: "test", createContext: async () => context, render: async () => "never" });
  assert.equal(result.state, "needs_input");
  assert.deepEqual(result.next_action, { code: "provide-input", fields: ["brief"] });
});

test("run converts expected failures to compact failed state", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "k-teach-run-"));
  const result = await runGeneration({
    root, intent: "learn", lessonId: "lesson", version: "test",
    createContext: async () => { throw new Error("raw private failure detail"); },
    render: async () => "never",
  });
  assert.equal(result.state, "failed");
  assert.equal(result.next_action.code, "inspect-error");
  assert.deepEqual(result.warnings, []);
  assert.doesNotMatch(JSON.stringify(result), /private failure detail/);
});

test("run preserves an attention-required recovery seam without retrying", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "k-teach-run-"));
  const result = await runGeneration({
    root, intent: "learn", lessonId: "lesson", version: "test",
    createContext: async () => structuredClone({ ...context, intent: "learn" }),
    render: async () => { throw new GenerationAttentionRequired("attempt-a"); },
  });
  assert.equal(result.state, "attention_required");
  assert.equal(result.refs.publication_attempt, "attempt-a");
  assert.equal(result.next_action.code, "inspect-publication-attempt");
});

test("stale plan persists only its item-level review delta", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "k-teach-run-"));
  let current = structuredClone(context);
  const options = { root, intent: "wechat", lessonId: "lesson", briefId: "brief", version: "test", createContext: async () => structuredClone(current), render: async () => "never" };
  assert.equal((await runGeneration(options)).state, "needs_plan");
  current.packet_id = "ctx-changed";
  current.provenance.input_hash = "c".repeat(64);
  current.provenance.planning_hash = "d".repeat(64);
  current.sections[0].blocks[0].body = "changed";
  const stale = await runGeneration(options);
  assert.equal(stale.state, "needs_plan");
  assert.equal(stale.next_action.code, "review-stale-plan");
  const delta = JSON.parse(await readFile(path.join(root, "plans", "articles", "brief.review.json"), "utf8"));
  assert.equal(delta.needs_review.length, 1);
  assert.equal(delta.needs_review[0].reason, "source_changed");
});
