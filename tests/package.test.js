import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(".");

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
});
