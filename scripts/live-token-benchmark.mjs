import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { evaluateLiveSamples, interleavedSchedule, renderLiveMarkdown, validateLiveConfig, verifyBenchmarkPackage } from "../dist/live-benchmark.js";

const option = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
const configPath = option("--config");
if (!configPath) throw new Error("Pass --config <benchmark-config.json>.");
const config = JSON.parse(await readFile(path.resolve(configPath), "utf8"));
validateLiveConfig(config);
const identities = {
  baseline: await verifyBenchmarkPackage(path.resolve(config.packages.baseline.root), config.packages.baseline),
  candidate: await verifyBenchmarkPackage(path.resolve(config.packages.candidate.root), config.packages.candidate),
};
const dryRun = { verified: true, provider: config.provider, prompt_hashes: config.prompt_hashes, identities, schedule: interleavedSchedule(config.scenarios, 3) };
if (process.argv.includes("--dry-run")) process.stdout.write(`${JSON.stringify(dryRun)}\n`);
else {
  const samplesPath = option("--samples");
  if (!samplesPath) throw new Error("Pass provider-captured --samples <json> or use --dry-run; the harness never spends tokens implicitly.");
  const samples = JSON.parse(await readFile(path.resolve(samplesPath), "utf8"));
  const result = evaluateLiveSamples(config.scenarios, samples);
  const markdownPath = option("--markdown");
  if (markdownPath) await writeFile(path.resolve(markdownPath), renderLiveMarkdown(config, result), "utf8");
  process.stdout.write(`${JSON.stringify({ ...dryRun, result })}\n`);
}
