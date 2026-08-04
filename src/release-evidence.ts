import { evaluateLiveSamples, validateLiveConfig, type LiveBenchmarkConfig, type LiveSample } from "./live-benchmark.ts";

export interface ReleaseEvidence {
  candidate: {
    clean_checkout: boolean;
    source_hash: string;
    tarball_hash: string;
    packed_install_smoke: boolean;
  };
  tier1: {
    tests_passed: boolean;
    typecheck_passed: boolean;
    build_passed: boolean;
    token_budgets_passed: boolean;
    privacy_scan_passed: boolean;
    migration_absence_scan_passed: boolean;
  };
  ci: { ubuntu: boolean; macos: boolean; windows: boolean };
  browser: Record<"learn" | "ppt" | "wechat", {
    desktop: boolean;
    mobile: boolean;
    print: boolean;
    interactions: boolean;
  }>;
  live: { config: LiveBenchmarkConfig; samples: LiveSample[] };
  safety: { no_public_publish: boolean; no_real_wechat_write: boolean };
}

export interface ReleaseEvidenceResult {
  verified: boolean;
  failures: string[];
}

const hash = /^[a-f0-9]{64}$/;

export function verifyReleaseEvidence(value: unknown): ReleaseEvidenceResult {
  const evidence = value as Partial<ReleaseEvidence>;
  const failures: string[] = [];
  const requireTrue = (condition: unknown, name: string) => {
    if (condition !== true) failures.push(name);
  };
  const requireText = (text: unknown, name: string) => {
    if (typeof text !== "string" || !text.trim()) failures.push(name);
  };
  const requireHash = (text: unknown, name: string) => {
    if (typeof text !== "string" || !hash.test(text)) failures.push(name);
  };

  requireTrue(evidence.candidate?.clean_checkout, "candidate.clean_checkout");
  requireHash(evidence.candidate?.source_hash, "candidate.source_hash");
  requireHash(evidence.candidate?.tarball_hash, "candidate.tarball_hash");
  requireTrue(evidence.candidate?.packed_install_smoke, "candidate.packed_install_smoke");
  for (const field of ["tests_passed", "typecheck_passed", "build_passed", "token_budgets_passed", "privacy_scan_passed", "migration_absence_scan_passed"] as const) {
    requireTrue(evidence.tier1?.[field], `tier1.${field}`);
  }
  for (const platform of ["ubuntu", "macos", "windows"] as const) requireTrue(evidence.ci?.[platform], `ci.${platform}`);
  for (const route of ["learn", "ppt", "wechat"] as const) {
    const checks = route === "wechat" ? ["desktop", "mobile", "interactions"] as const : ["desktop", "mobile", "print", "interactions"] as const;
    for (const check of checks) requireTrue(evidence.browser?.[route]?.[check], `browser.${route}.${check}`);
  }
  try {
    const config = validateLiveConfig(evidence.live?.config);
    const report = evaluateLiveSamples(config.scenarios, evidence.live?.samples ?? []);
    requireTrue(report.thresholds.passed, "live.thresholds.passed");
  } catch (error) {
    failures.push(`live.direct_evidence: ${error instanceof Error ? error.message : String(error)}`);
  }
  requireTrue(evidence.safety?.no_public_publish, "safety.no_public_publish");
  requireTrue(evidence.safety?.no_real_wechat_write, "safety.no_real_wechat_write");
  return { verified: failures.length === 0, failures };
}
