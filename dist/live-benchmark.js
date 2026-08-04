import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";














































const digest = /^[a-f0-9]{64}$/;
const sampleKey = (sample                                                         ) => `${sample.variant}/${sample.scenario}/${sample.repetition}`;

export function validateLiveConfig(value         )                      {
  if (!value || typeof value !== "object") throw new Error("Missing live benchmark configuration.");
  const config = value                                ;
  for (const field of ["provider", "model", "model_snapshot", "agent_version", "command_version", "reasoning_effort"]         ) {
    if (typeof config[field] !== "string" || !config[field].trim()) throw new Error(`Missing live config field: ${field}`);
  }
  if (config.repetitions !== 3) throw new Error("Live benchmark requires exactly three repetitions.");
  for (const [name, hash] of Object.entries({ ...(config.prompt_hashes ?? {}), generated_integration: config.generated_integration_hash, tool_definitions: config.tool_definitions_hash, permissions: config.permissions_hash, fixture: config.fixture_hash, environment: config.environment_hash, baseline_package: config.packages?.baseline?.expected_root_hash, candidate_package: config.packages?.candidate?.expected_root_hash })) {
    if (typeof hash !== "string" || !digest.test(hash)) throw new Error(`Invalid frozen hash: ${name}`);
  }
  if (!config.sampling || typeof config.sampling !== "object") throw new Error("Missing live config field: sampling");
  if (typeof config.prompt_caching?.enabled !== "boolean") throw new Error("Missing live config field: prompt_caching.enabled");
  for (const variant of ["baseline", "candidate"]         ) {
    const item = config.packages?.[variant];
    if (!item || !item.root || !item.name || !item.version) throw new Error(`Missing live package config: ${variant}`);
  }
  const scenarios = config.scenarios ?? [];
  const expected = ["learn", "ppt", "wechat"].flatMap((route) => ["cold", "warm", "delta"].map((phase) => `${route}-${phase}`));
  const actual = scenarios.map((scenario) => `${scenario.route}-${scenario.phase}`);
  if (scenarios.length !== 9 || new Set(actual).size !== 9 || expected.some((item) => !actual.includes(item))) throw new Error("Live scenarios must contain Learn, PPT, and WeChat cold/warm/delta exactly once.");
  if (new Set(scenarios.map((scenario) => scenario.id)).size !== scenarios.length) throw new Error("Live scenario ids must be unique.");
  return config                       ;
}

export function interleavedSchedule(scenarios                , repetitions = 3) {
  return Array.from({ length: repetitions }, (_, index) => scenarios.flatMap((scenario) => [
    { variant: "baseline"         , scenario, repetition: index + 1 },
    { variant: "candidate"         , scenario, repetition: index + 1 },
  ])).flat();
}

export function median(values          )         {
  const ordered = [...values].sort((left, right) => left - right);
  if (!ordered.length) throw new Error("Median requires at least one value.");
  return ordered[Math.floor(ordered.length / 2)];
}

export function redact   (value   )    {
  const visit = (item         , key = "")          => {
    if (/secret|password|cookie|authorization|openid|api[_-]?key/i.test(key)) return "[REDACTED]";
    if (typeof item === "string") return item.replace(/(?:sk-|Bearer )[A-Za-z0-9._-]+/g, "[REDACTED]");
    if (Array.isArray(item)) return item.map((entry) => visit(entry));
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).map(([entryKey, entry]) => [entryKey, visit(entry, entryKey)]));
    return item;
  };
  return visit(value)     ;
}

function successfulSamples(scenarios                , samples              )               {
  for (const sample of samples) {
    if (sample.failure?.kind === "content") throw new Error(`Content failure cannot be replaced: ${sample.failure.code}`);
    if (sample.failure?.kind === "environmental" && sample.failure.model_executed) throw new Error(`Environmental replacement is only allowed before model execution: ${sample.failure.code}`);
  }
  const expected = interleavedSchedule(scenarios);
  const selected = expected.map((item) => {
    const key = `${item.variant}/${item.scenario.id}/${item.repetition}`;
    const successes = samples.filter((sample) => sampleKey(sample) === key && !sample.failure);
    if (successes.length !== 1) throw new Error(successes.length ? `Duplicate successful sample: ${key}` : `Missing usage sample: ${key}`);
    return successes[0];
  });
  const actualOrder = samples.filter((sample) => !sample.failure).map(sampleKey);
  const expectedOrder = selected.map(sampleKey);
  if (JSON.stringify(actualOrder) !== JSON.stringify(expectedOrder)) throw new Error("Successful samples are not in the required interleaved order.");
  return selected;
}

export function evaluateLiveSamples(scenarios                , samples              ) {
  const selected = successfulSamples(scenarios, samples);
  for (const sample of selected) {
    for (const field of ["uncached_input", "cached_input", "output", "control", "semantic"]         ) if (!Number.isFinite(sample.usage[field]) || sample.usage[field] < 0) throw new Error(`Missing usage field ${field}`);
    for (const field of ["requests", "retries", "elapsed_ms", "plan_review_items"]         ) if (!Number.isFinite(sample[field]) || sample[field] < 0) throw new Error(`Missing sample field ${field}`);
    if (!Number.isFinite(sample.tool_payload_tokens?.arguments) || !Number.isFinite(sample.tool_payload_tokens?.results)) throw new Error("Missing tool payload attribution");
    if (!Array.isArray(sample.optional_reference_loads) || !Array.isArray(sample.cli_invocations)) throw new Error("Missing tool/reference trace");
    if (!sample.quality_passed || !sample.quality_assertions?.length || !digest.test(sample.artifact_hash) || !digest.test(sample.manifest_hash) || sample.generation_state !== "complete") throw new Error(`Quality failed: ${sampleKey(sample)}`);
  }
  const variants = ["baseline", "candidate"]         ;
  const medians = Object.fromEntries(variants.map((variant) => [variant, Object.fromEntries(scenarios.map((scenario) => {
    const group = selected.filter((sample) => sample.variant === variant && sample.scenario === scenario.id);
    return [scenario.id, {
      control: median(group.map((sample) => sample.usage.control)),
      total: median(group.map((sample) => sample.usage.control + sample.usage.semantic + sample.usage.output)),
      uncached_input: median(group.map((sample) => sample.usage.uncached_input)),
      cached_input: median(group.map((sample) => sample.usage.cached_input)),
      output: median(group.map((sample) => sample.usage.output)),
      requests: median(group.map((sample) => sample.requests)),
      retries: median(group.map((sample) => sample.retries)),
      elapsed_ms: median(group.map((sample) => sample.elapsed_ms)),
    }];
  }))]))                                                                                                                                                                                                              ;
  const sum = (variant                          , field                     ) => Object.values(medians[variant]).reduce((total, item) => total + item[field], 0);
  const controlReduction = (sum("baseline", "control") - sum("candidate", "control")) / sum("baseline", "control") * 100;
  const totalReduction = (sum("baseline", "total") - sum("candidate", "total")) / sum("baseline", "total") * 100;
  const layoutZero = selected.filter((sample) => sample.variant === "candidate").every((sample) => sample.model_authored_layout_code_tokens === 0);
  const noRouteRegression = scenarios.every((scenario) => medians.candidate[scenario.id].control <= medians.baseline[scenario.id].control && medians.candidate[scenario.id].total <= medians.baseline[scenario.id].total);
  const warmWithinBudget = scenarios.filter((scenario) => scenario.phase === "warm").every((scenario) => medians.candidate[scenario.id].control <= 600);
  return redact({ medians, thresholds: { control_reduction_percent: Number(controlReduction.toFixed(2)), total_reduction_percent: Number(totalReduction.toFixed(2)), layout_zero: layoutZero, no_route_regression: noRouteRegression, warm_within_budget: warmWithinBudget, passed: controlReduction >= 60 && totalReduction >= 35 && layoutZero && noRouteRegression && warmWithinBudget }, samples });
}

export function renderLiveMarkdown(config                     , report                                        )         {
  const rows = config.scenarios.map((scenario) => `| ${scenario.id} | ${report.medians.baseline[scenario.id].control} | ${report.medians.candidate[scenario.id].control} | ${report.medians.baseline[scenario.id].total} | ${report.medians.candidate[scenario.id].total} |`);
  return [`# K Teach live token benchmark`, ``, `Provider/model: ${config.provider} / ${config.model_snapshot}`, `Repetitions: 3, interleaved baseline/candidate`, ``, `| Scenario | Baseline control | Candidate control | Baseline total | Candidate total |`, `| --- | ---: | ---: | ---: | ---: |`, ...rows, ``, `Control reduction: ${report.thresholds.control_reduction_percent}%`, `Total reduction: ${report.thresholds.total_reduction_percent}%`, `Passed: ${report.thresholds.passed}`].join("\n") + "\n";
}

async function hashTree(root        )                  {
  const entries                                             = [];
  const walk = async (directory        ) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) entries.push({ path: path.relative(root, absolute).split(path.sep).join("/"), bytes: await readFile(absolute) });
    }
  };
  await walk(root);
  const hash = createHash("sha256");
  for (const entry of entries.sort((left, right) => left.path.localeCompare(right.path))) hash.update(entry.path).update("\0").update(entry.bytes).update("\0");
  return hash.digest("hex");
}

export async function verifyBenchmarkPackage(root        , expected                                                                )                                 {
  const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"))                                       ;
  if (manifest.name !== expected.name || manifest.version !== expected.version) throw new Error(`Package identity mismatch at ${root}`);
  const rootHash = await hashTree(root);
  if (expected.expected_root_hash && rootHash !== expected.expected_root_hash) throw new Error(`Package root hash mismatch at ${root}`);
  return { root_hash: rootHash };
}


//# sourceURL=k-teach/src/live-benchmark.ts