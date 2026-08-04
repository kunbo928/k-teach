import assert from "node:assert/strict";
import test from "node:test";

import { verifyReleaseEvidence } from "../dist/release-evidence.js";

const digest = "a".repeat(64);
const scenarios = ["learn", "ppt", "wechat"].flatMap((route) => ["cold", "warm", "delta"].map((phase) => ({ id: `${route}-${phase}`, route, phase })));
const liveConfig = { provider: "provider", model: "model", model_snapshot: "snapshot", agent_version: "1", command_version: "0.6.0", generated_integration_hash: digest, repetitions: 3, reasoning_effort: "medium", sampling: { temperature: 0 }, prompt_hashes: { system: digest, developer: digest, user: digest }, tool_definitions_hash: digest, permissions_hash: digest, fixture_hash: digest, environment_hash: digest, prompt_caching: { enabled: false }, packages: { baseline: { root: "/baseline", name: "k-teach", version: "0.6.0", expected_root_hash: digest }, candidate: { root: "/candidate", name: "k-teach", version: "0.6.0", expected_root_hash: digest } }, scenarios };
const liveSamples = Array.from({ length: 3 }, (_, repetitionIndex) => scenarios.flatMap((scenario) => ["baseline", "candidate"].map((variant) => ({ variant, scenario: scenario.id, repetition: repetitionIndex + 1, attempt: 1, usage: variant === "baseline" ? { uncached_input: 1500, cached_input: 0, output: 50, control: 1000, semantic: 500 } : { uncached_input: 700, cached_input: 0, output: 50, control: 300, semantic: 500 }, requests: 1, retries: 0, tool_payload_tokens: { arguments: 10, results: 20 }, optional_reference_loads: [], cli_invocations: ["generate"], artifact_hash: digest, manifest_hash: digest, generation_state: "complete", plan_review_items: 0, quality_passed: true, quality_assertions: ["valid"], model_authored_layout_code_tokens: 0, elapsed_ms: 100 })))).flat();
const complete = {
  candidate: { clean_checkout: true, source_hash: digest, tarball_hash: digest, packed_install_smoke: true },
  tier1: { tests_passed: true, typecheck_passed: true, build_passed: true, token_budgets_passed: true, privacy_scan_passed: true, migration_absence_scan_passed: true },
  ci: { ubuntu: true, macos: true, windows: true },
  browser: Object.fromEntries(["learn", "ppt", "wechat"].map((route) => [route, { desktop: true, mobile: true, print: true, interactions: true }])),
  live: { config: liveConfig, samples: liveSamples },
  safety: { no_public_publish: true, no_real_wechat_write: true },
};

test("release verifier accepts only complete direct evidence", () => {
  assert.deepEqual(verifyReleaseEvidence(complete), { verified: true, failures: [] });
});

test("release verifier names missing external and visual gates", () => {
  const incomplete = structuredClone(complete);
  incomplete.ci.windows = false;
  incomplete.browser.ppt.print = false;
  incomplete.live = undefined;
  const result = verifyReleaseEvidence(incomplete);
  assert.equal(result.verified, false);
  assert.ok(result.failures.includes("ci.windows"));
  assert.ok(result.failures.includes("browser.ppt.print"));
  assert.ok(result.failures.some((failure) => failure.startsWith("live.direct_evidence:")));
});
