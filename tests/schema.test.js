import assert from "node:assert/strict";
import test from "node:test";

import { validateDocument } from "../src/schema.ts";

test("domain schema validates a Lesson Bundle through the public contract", async () => {
  const valid = await validateDocument("lesson-bundle", {
    schema_version: 1,
    id: "event-loop-01",
    revision: "2026-07-27T00:00:00Z",
    title: "理解事件循环",
    mission: "能够解释一次异步任务的执行顺序",
    objectives: ["预测微任务与定时器的输出顺序"],
    sources: [{ title: "Node.js docs", url: "https://nodejs.org/" }],
    composition: "workshop",
    visuals: "off",
  });
  assert.deepEqual(valid, []);

  const invalid = await validateDocument("lesson-bundle", {
    schema_version: 1,
    id: "event-loop-01",
    secret: "must-not-be-accepted",
  });
  assert.deepEqual(invalid, [
    "missing required property: revision",
    "missing required property: title",
    "missing required property: mission",
    "missing required property: objectives",
    "missing required property: sources",
    "missing required property: composition",
    "missing required property: visuals",
    "unknown property: secret",
  ]);
});

test("VNext schemas validate Context Packet, semantic Plans, and Generation Run results", async () => {
  const packet = {
    schema_version: 1,
    packet_id: "ctx-123",
    intent: "wechat",
    teach: { id: "main", title: "事件循环" },
    lesson: {
      id: "event-loop-01",
      revision: "2026-08-04T00:00:00Z",
      title: "理解事件循环",
      mission: "解释异步任务的执行顺序",
      objectives: ["预测输出顺序"],
    },
    sections: [{
      id: "section-model",
      heading: "建立模型",
      blocks: [{
        id: "block-model-1",
        kind: "paragraph",
        body: "先区分调用栈与任务队列。",
        asset_ids: [],
      }],
    }],
    sources: [{ id: "source-node", title: "Node.js docs", url: "https://nodejs.org/" }],
    assets: [],
    route: { brief_id: "public-event-loop", article_type: "analysis" },
    diagnostics: { missing_fields: [], blockers: [], warnings: [] },
    provenance: {
      input_hash: "a".repeat(64),
      planning_hash: "b".repeat(64),
      lesson_revision: "2026-08-04T00:00:00Z",
      brief_revision: "2026-08-04T00:01:00Z",
    },
  };
  assert.deepEqual(await validateDocument("context-packet", packet), []);

  const articlePlan = {
    schema_version: 1,
    id: "article-public-event-loop",
    revision: "2026-08-04T00:02:00Z",
    kind: "article",
    context: {
      packet_id: packet.packet_id,
      planning_hash: packet.provenance.planning_hash,
      lesson_id: packet.lesson.id,
      lesson_revision: packet.lesson.revision,
    },
    route_brief: { id: "public-event-loop", revision: "2026-08-04T00:01:00Z" },
    blocks: [{
      id: "article-lead",
      role: "lead",
      heading: "为什么顺序容易猜错",
      content: [{
        mode: "authored",
        text: "先用一个反直觉现象建立问题。",
        source_refs: ["block-model-1"],
      }],
      asset_refs: [],
    }],
  };
  assert.deepEqual(await validateDocument("article-plan", articlePlan), []);

  const run = {
    schema_version: 1,
    run_id: "run-123",
    state: "needs_plan",
    intent: "wechat",
    input_hash: "c".repeat(64),
    next_action: { code: "review-plan", fields: [] },
    refs: {
      context_packet: packet.packet_id,
      route_brief: "public-event-loop",
      plan: articlePlan.id,
      artifact: null,
      publication_attempt: null,
    },
    warnings: [],
  };
  assert.deepEqual(await validateDocument("generation-run-result", run), []);
});

test("VNext schemas reject layout fields, empty authored refs, and secrets", async () => {
  const invalidPlan = {
    schema_version: 1,
    id: "article-invalid",
    revision: "2026-08-04T00:02:00Z",
    kind: "article",
    context: {
      packet_id: "ctx-1",
      planning_hash: "b".repeat(64),
      lesson_id: "lesson-1",
      lesson_revision: "rev-1",
    },
    route_brief: { id: "brief-1", revision: "rev-1" },
    blocks: [{
      id: "lead",
      role: "lead",
      content: [{ mode: "authored", text: "无来源改写", source_refs: [] }],
      asset_refs: [],
      html: "<section>forbidden</section>",
    }],
  };
  const planErrors = await validateDocument("article-plan", invalidPlan);
  assert.ok(planErrors.some((error) => error.includes("source_refs") && error.includes("at least 1")));
  assert.ok(planErrors.some((error) => error.includes("unknown property: html")));

  const invalidPacket = {
    schema_version: 1,
    packet_id: "ctx-secret",
    intent: "wechat",
    secret: "must-not-be-exposed",
  };
  const packetErrors = await validateDocument("context-packet", invalidPacket);
  assert.ok(packetErrors.some((error) => error.includes("unknown property: secret")));
});
