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
