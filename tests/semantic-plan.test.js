import assert from "node:assert/strict";
import test from "node:test";

import { rebaseSemanticPlan, scaffoldSemanticPlan, validateSemanticPlan } from "../dist/semantic-plan.js";

const packet = {
  schema_version: 1,
  packet_id: "ctx-a",
  intent: "wechat",
  teach: { id: "main", title: "课程" },
  lesson: { id: "lesson", revision: "r1", title: "标题", mission: "任务", objectives: ["目标"] },
  sections: [
    { id: "s1", heading: "观察", blocks: [{ id: "b1", kind: "paragraph", body: "先观察输出。", asset_ids: [] }] },
    { id: "s2", heading: "解释", blocks: [{ id: "b2", kind: "paragraph", body: "再解释模型。", asset_ids: [] }] },
  ],
  sources: [{ id: "source-1", title: "Docs", url: "https://example.com" }],
  assets: [], route: { id: "brief", revision: "br1", article_type: "analysis" },
  diagnostics: { missing_fields: [], blockers: [], warnings: [] },
  provenance: { input_hash: "a".repeat(64), planning_hash: "b".repeat(64), lesson_revision: "r1", brief_revision: "br1" },
};

test("scaffold is deterministic, reference-only, and valid", async () => {
  const first = scaffoldSemanticPlan(packet);
  const second = scaffoldSemanticPlan(packet);
  assert.deepEqual(first, second);
  assert.equal(first.kind, "article");
  assert.deepEqual(first.blocks.flatMap((block) => block.content), [
    { mode: "reference", source_refs: ["b1"] },
    { mode: "reference", source_refs: ["b2"] },
  ]);
  assert.deepEqual(await validateSemanticPlan(first, packet), []);
});

test("validation rejects unknown refs and unsupported authored blobs", async () => {
  const plan = scaffoldSemanticPlan(packet);
  plan.blocks[0].content = [{ mode: "authored", text: "x".repeat(281), source_refs: ["missing"] }];
  const errors = await validateSemanticPlan(plan, packet);
  assert.ok(errors.some((error) => error.includes("missing")));
  assert.ok(errors.some((error) => error.includes("280")));
});

test("rebase isolates changed, removed, and newly selected semantic refs", () => {
  const plan = scaffoldSemanticPlan(packet);
  const current = structuredClone(packet);
  current.packet_id = "ctx-b";
  current.sections[0].blocks[0].body = "输出发生了变化。";
  current.sections[1].blocks = [];
  current.sections.push({ id: "s3", heading: "总结", blocks: [{ id: "b3", kind: "paragraph", body: "总结。", asset_ids: [] }] });
  const delta = rebaseSemanticPlan(plan, packet, current);
  assert.deepEqual(delta.unchanged, []);
  assert.deepEqual(delta.needs_review.map((item) => [item.item_id, item.reason]), [
    [plan.blocks[0].id, "source_changed"],
    [plan.blocks[1].id, "source_removed"],
  ]);
  assert.deepEqual(delta.proposed, [{ item_id: "proposal-b3", reason: "newly_selected_content" }]);
});
