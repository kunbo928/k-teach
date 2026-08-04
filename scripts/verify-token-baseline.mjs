import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const root = process.cwd();
const baseline = JSON.parse(
  await readFile(path.join(root, "benchmarks/token/baseline-0.6.0.json"), "utf8"),
);

const execFileAsync = promisify(execFile);

async function baselineSha256(relative) {
  const { stdout } = await execFileAsync(
    "git",
    ["show", `${baseline.source.git_commit}:${relative}`],
    { cwd: root, encoding: "buffer", maxBuffer: 8 * 1024 * 1024 },
  );
  return createHash("sha256")
    .update(stdout)
    .digest("hex");
}

const expected = {
  "SKILL.md": baseline.source.skill_sha256,
  "package.json": baseline.source.package_json_sha256,
  "pnpm-lock.yaml": baseline.source.pnpm_lock_sha256,
};

for (const [file, hash] of Object.entries(expected)) {
  const actual = await baselineSha256(file);
  if (actual !== hash) {
    throw new Error(`${file} differs from frozen baseline: ${actual}`);
  }
}

const references = await readdir(path.join(root, "references"));
if (references.filter((name) => name.endsWith(".md")).length !== 7) {
  throw new Error("Frozen baseline expects exactly seven Markdown references.");
}

process.stdout.write(
  `${JSON.stringify({
    verified: true,
    version: baseline.package.version,
    git_commit: baseline.source.git_commit,
    files: Object.keys(expected),
  })}\n`,
);
