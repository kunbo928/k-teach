import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const tarball = process.argv[2];
if (!tarball) throw new Error("Usage: node scripts/verify-tarball.mjs <package.tgz>");

const { stdout } = await execFileAsync("npm", ["pack", tarball, "--json", "--dry-run"], {
  encoding: "utf8",
});
const listing = JSON.parse(stdout)[0];
const names = listing.files.map((entry) => entry.path);
for (const required of [
  "bin/k-teach.js",
  "dist/cli.js",
  "dist/agent-integration.js",
  "SKILL.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "UPSTREAM.md",
]) {
  if (!names.includes(required)) throw new Error(`Tarball missing ${required}`);
}
for (const forbidden of ["src/", "tests/", ".scratch/", ".env", ".git/"]) {
  if (names.some((name) => name === forbidden || name.startsWith(forbidden))) {
    throw new Error(`Tarball contains forbidden path ${forbidden}`);
  }
}

const installRoot = await mkdtemp(path.join(tmpdir(), "k-teach-tarball-"));
await execFileAsync("npm", ["install", "--ignore-scripts", path.resolve(tarball)], {
  cwd: installRoot,
  encoding: "utf8",
});
const bin = path.join(installRoot, "node_modules", ".bin", "k-teach");
const version = await execFileAsync(bin, ["--version"], {
  cwd: installRoot,
  encoding: "utf8",
});
if (version.stdout.trim() !== "0.0.1") {
  throw new Error(`Installed CLI reported ${version.stdout.trim()}`);
}
await readFile(path.join(installRoot, "node_modules", "k-teach", "SKILL.md"));
const projectRoot = path.join(installRoot, "smoke-project");
await execFileAsync(bin, ["init", projectRoot, "--tools", "codex"], {
  cwd: installRoot,
  encoding: "utf8",
});
await stat(path.join(projectRoot, "k-teach", "config.yaml"));
await stat(
  path.join(projectRoot, ".codex", "skills", "k-teach", "SKILL.md"),
);
await execFileAsync(bin, ["update", projectRoot], {
  cwd: installRoot,
  encoding: "utf8",
});
process.stdout.write(`Verified ${tarball} and isolated install.\n`);
