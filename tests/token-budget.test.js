import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { encode } from "gpt-tokenizer/model/gpt-5";

const count = (value) => encode(typeof value === "string" ? value : JSON.stringify(value)).length;
const skillTokenLimit = 550;
const refs = { context_packet: "ctx-a", route_brief: "brief-a", plan: "plan-a", artifact: null, publication_attempt: null };
const envelope = { schema_version: 1, run_id: "run-a", intent: "wechat", input_hash: "a".repeat(64), warnings: [] };

test("canonical Skill stays within the pinned GPT-5 token budget", async () => {
  const skill = await readFile("SKILL.md", "utf8");
  assert.ok(count(skill) <= skillTokenLimit, `SKILL.md uses ${count(skill)} tokens; limit ${skillTokenLimit}`);
  assert.doesNotMatch(skill, /render web|render ppt|wechat render|compatibility|gzh-design|html-ppt|\/Users\//i);
});

test("ordinary compact control turns stay below 600 non-semantic tokens", () => {
  const fixtures = [
    { ...envelope, state: "needs_input", next_action: { code: "provide-input", fields: ["brief"] }, refs: { ...refs, context_packet: null, route_brief: null, plan: null } },
    { ...envelope, state: "needs_plan", next_action: { code: "review-plan", fields: [] }, refs },
    { ...envelope, state: "complete", next_action: { code: null, fields: [] }, refs: { ...refs, artifact: "wechat-a" } },
    { ...envelope, state: "attention_required", next_action: { code: "inspect-publication-attempt", fields: [] }, refs: { ...refs, publication_attempt: "attempt-a" }, error: { code: "remote-unknown", fields: [], refs: ["attempt-a"] } },
  ];
  for (const fixture of fixtures) assert.ok(count(fixture) <= 600, `${fixture.state} uses ${count(fixture)} tokens`);
});

test("one structured error stays below 200 tokens", () => {
  const failure = { ...envelope, state: "failed", next_action: { code: "inspect-error", fields: [] }, refs: { context_packet: null, route_brief: null, plan: null, artifact: null, publication_attempt: null }, error: { code: "invalid-brief", fields: [], refs: [] } };
  assert.ok(count(failure) <= 200, `structured error uses ${count(failure)} tokens`);
});
