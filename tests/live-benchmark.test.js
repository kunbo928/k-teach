import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { evaluateLiveSamples, interleavedSchedule, median, redact, renderLiveMarkdown, validateLiveConfig, verifyBenchmarkPackage } from "../dist/live-benchmark.js";

const digest = "a".repeat(64);
const scenarios = ["learn", "ppt", "wechat"].flatMap((route) => ["cold", "warm", "delta"].map((phase) => ({ id: `${route}-${phase}`, route, phase })));
const config = { provider: "provider", model: "model", model_snapshot: "model-2026-08-04", agent_version: "1.0.0", command_version: "0.6.0", generated_integration_hash: digest, repetitions: 3, reasoning_effort: "medium", sampling: { temperature: 0 }, prompt_hashes: { system: digest, developer: digest, user: digest }, tool_definitions_hash: digest, permissions_hash: digest, fixture_hash: digest, environment_hash: digest, prompt_caching: { enabled: false }, packages: { baseline: { root: "/baseline", name: "k-teach", version: "0.6.0", expected_root_hash: digest }, candidate: { root: "/candidate", name: "k-teach", version: "0.6.0", expected_root_hash: digest } }, scenarios };

function fakeSamples() {
  return interleavedSchedule(scenarios).map(({ variant, scenario, repetition }) => ({
    variant, scenario: scenario.id, repetition, attempt: 1,
    usage: variant === "baseline" ? { uncached_input: 1500, cached_input: 0, output: 50, control: 1000 + repetition, semantic: 500 } : { uncached_input: 700, cached_input: 0, output: 50, control: 300 + repetition, semantic: 500 },
    requests: 1, retries: 0, tool_payload_tokens: { arguments: 10, results: 20 }, optional_reference_loads: [], cli_invocations: ["k-teach generate --json"],
    artifact_hash: digest, manifest_hash: digest, generation_state: "complete", plan_review_items: scenario.phase === "delta" ? 1 : 0,
    quality_passed: true, quality_assertions: ["artifact-valid"], model_authored_layout_code_tokens: 0, elapsed_ms: 100,
  }));
}

test("live config freezes the full 3x3 matrix and benchmark environment", () => {
  assert.equal(validateLiveConfig(config), config);
  assert.throws(() => validateLiveConfig({ ...config, scenarios: scenarios.slice(1) }), /cold\/warm\/delta/);
  assert.throws(() => validateLiveConfig({ ...config, fixture_hash: "moving" }), /Invalid frozen hash/);
});

test("live harness interleaves pairs, captures medians, and renders Markdown", () => {
  const schedule = interleavedSchedule(scenarios);
  assert.equal(schedule.length, 54);
  assert.deepEqual(schedule.slice(0, 2).map((item) => item.variant), ["baseline", "candidate"]);
  assert.equal(median([3, 1, 2]), 2);
  const report = evaluateLiveSamples(scenarios, fakeSamples());
  assert.equal(report.thresholds.passed, true);
  assert.equal(report.thresholds.warm_within_budget, true);
  assert.match(renderLiveMarkdown(config, report), /Control reduction: .*%/);
});

test("live harness enforces ordering, attribution, quality, and failure policy", () => {
  assert.throws(() => evaluateLiveSamples(scenarios, fakeSamples().slice(1)), /Missing usage sample/);
  const reordered = fakeSamples(); [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  assert.throws(() => evaluateLiveSamples(scenarios, reordered), /interleaved order/);
  const quality = fakeSamples(); quality[0].quality_passed = false;
  assert.throws(() => evaluateLiveSamples(scenarios, quality), /Quality failed/);
  const missingTrace = fakeSamples(); missingTrace[0].cli_invocations = undefined;
  assert.throws(() => evaluateLiveSamples(scenarios, missingTrace), /tool\/reference trace/);
  const content = fakeSamples(); content[0].failure = { kind: "content", code: "invalid-artifact", model_executed: true };
  assert.throws(() => evaluateLiveSamples(scenarios, content), /cannot be replaced/);
  const lateEnvironmental = fakeSamples(); lateEnvironmental[0].failure = { kind: "environmental", code: "usage-corrupt", model_executed: true };
  assert.throws(() => evaluateLiveSamples(scenarios, lateEnvironmental), /before model execution/);
  const replaced = fakeSamples(); replaced.unshift({ ...replaced[0], attempt: 1, failure: { kind: "environmental", code: "provider-outage", model_executed: false } }); replaced[1].attempt = 2;
  assert.equal(evaluateLiveSamples(scenarios, replaced).thresholds.passed, true);
});

test("live harness redacts secrets and verifies package identities", async () => {
  assert.deepEqual(redact({ api_key: "secret", text: "Bearer abc123", nested: { openid: "person" } }), { api_key: "[REDACTED]", text: "[REDACTED]", nested: { openid: "[REDACTED]" } });
  const root = await mkdtemp(path.join(tmpdir(), "k-teach-live-package-"));
  await writeFile(path.join(root, "package.json"), JSON.stringify({ name: "k-teach", version: "test" }));
  const identity = await verifyBenchmarkPackage(root, { name: "k-teach", version: "test" });
  assert.match(identity.root_hash, /^[a-f0-9]{64}$/);
  await writeFile(path.join(root, "SKILL.md"), "changed");
  assert.notEqual((await verifyBenchmarkPackage(root, { name: "k-teach", version: "test" })).root_hash, identity.root_hash);
  await assert.rejects(verifyBenchmarkPackage(root, { name: "k-teach", version: "test", expected_root_hash: identity.root_hash }), /root hash mismatch/);
  await assert.rejects(verifyBenchmarkPackage(root, { name: "k-teach", version: "other" }), /identity mismatch/);
});
