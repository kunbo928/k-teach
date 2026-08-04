import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { encode as encodeComparison } from "gpt-tokenizer/model/gpt-4";
import { encode as encodeCurrent } from "gpt-tokenizer/model/gpt-5";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(await readFile(path.join(root, "benchmarks/token/baseline-0.6.0.json"), "utf8"));
const fixtureSet = JSON.parse(await readFile(path.join(root, "benchmarks/token/control-fixtures.json"), "utf8"));
const skill = await readFile(path.join(root, "SKILL.md"), "utf8");
const skillComparison = encodeComparison(skill).length;
const skillCurrent = encodeCurrent(skill).length;
const skillTokenLimit = 550;
if (skillComparison > skillTokenLimit || skillCurrent > skillTokenLimit) throw new Error(`Canonical Skill exceeds ${skillTokenLimit} tokens: ${skillComparison}/${skillCurrent}`);
const fixtures = Object.fromEntries(Object.entries(fixtureSet.fixtures).map(([name, value]) => {
  const serialized = JSON.stringify(value);
  const comparison = encodeComparison(serialized).length;
  const current = encodeCurrent(serialized).length;
  const limit = name === "structured_error" ? 200 : 600;
  if (comparison > limit || current > limit) throw new Error(`${name} exceeds ${limit} tokens`);
  return [name, { comparison, current, limit }];
}));
const baselineComparison = baseline.static_tokens.canonical_skill;
const reduction = Number(((baselineComparison - skillComparison) / baselineComparison * 100).toFixed(2));
process.stdout.write(`${JSON.stringify({
  verified: true,
  baseline: { version: baseline.package.version, comparison_skill_tokens: baselineComparison, current_tokenizer_skill_tokens: 1766 },
  candidate: { comparison_skill_tokens: skillComparison, current_tokenizer_skill_tokens: skillCurrent, limit: skillTokenLimit },
  skill_reduction_percent: reduction,
  fixtures,
  model_authored_layout_code_tokens: 0,
})}\n`);
