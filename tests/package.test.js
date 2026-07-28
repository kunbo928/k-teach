import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(".");

test("package metadata identifies the public MIT release and vendored notices", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  );

  assert.equal(manifest.name, "k-teach");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.private, false);
  assert.equal(manifest.license, "MIT");
  assert.equal(
    manifest.repository.url,
    "git+https://github.com/kunbo928/k-teach.git",
  );
  for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md", "UPSTREAM.md"]) {
    assert.ok(manifest.files.includes(file));
    assert.equal((await stat(path.join(packageRoot, file))).isFile(), true);
  }
});

test("npm build emits a JavaScript CLI that runs without the TypeScript source tree", async () => {
  assert.equal((await stat(path.join(packageRoot, "dist", "cli.js"))).isFile(), true);
  assert.doesNotMatch(
    await readFile(path.join(packageRoot, "dist", "cli.js"), "utf8"),
    /from\s+["'][^"']+\.ts["']/,
  );
  assert.match(
    await readFile(path.join(packageRoot, "bin", "k-teach.js"), "utf8"),
    /dist\/cli\.js/,
  );

  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-dist-smoke-"));
  const result = await execFileAsync(
    process.execPath,
    [path.join(packageRoot, "bin", "k-teach.js"), "capabilities", "--json"],
    { cwd: workspace, encoding: "utf8" },
  );
  assert.deepEqual(JSON.parse(result.stdout), {
    core: ["lesson-bundle", "web", "diagram"],
    optional: ["visual-provider", "wechat"],
    visual_modes: ["auto", "required", "off"],
  });
  const version = await execFileAsync(
    process.execPath,
    [path.join(packageRoot, "bin", "k-teach.js"), "--version"],
    { cwd: workspace, encoding: "utf8" },
  );
  assert.equal(version.stdout.trim(), "0.1.0");
});
