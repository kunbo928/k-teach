import { evaluateLiveSamples, validateLiveConfig,                                           } from "./live-benchmark.js";
































const hash = /^[a-f0-9]{64}$/;

export function verifyReleaseEvidence(value         )                        {
  const evidence = value                            ;
  const failures           = [];
  const requireTrue = (condition         , name        ) => {
    if (condition !== true) failures.push(name);
  };
  const requireText = (text         , name        ) => {
    if (typeof text !== "string" || !text.trim()) failures.push(name);
  };
  const requireHash = (text         , name        ) => {
    if (typeof text !== "string" || !hash.test(text)) failures.push(name);
  };

  requireTrue(evidence.candidate?.clean_checkout, "candidate.clean_checkout");
  requireHash(evidence.candidate?.source_hash, "candidate.source_hash");
  requireHash(evidence.candidate?.tarball_hash, "candidate.tarball_hash");
  requireTrue(evidence.candidate?.packed_install_smoke, "candidate.packed_install_smoke");
  for (const field of ["tests_passed", "typecheck_passed", "build_passed", "token_budgets_passed", "privacy_scan_passed", "migration_absence_scan_passed"]         ) {
    requireTrue(evidence.tier1?.[field], `tier1.${field}`);
  }
  for (const platform of ["ubuntu", "macos", "windows"]         ) requireTrue(evidence.ci?.[platform], `ci.${platform}`);
  for (const route of ["learn", "ppt", "wechat"]         ) {
    const checks = route === "wechat" ? ["desktop", "mobile", "interactions"]          : ["desktop", "mobile", "print", "interactions"]         ;
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


//# sourceURL=k-teach/src/release-evidence.ts