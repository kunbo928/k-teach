import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(".");

test("release workflow uses tags, OIDC, frozen installs, and the verified tarball", async () => {
  const workflow = await readFile(
    path.join(packageRoot, ".github", "workflows", "publish.yml"),
    "utf8",
  );

  assert.match(workflow, /tags:\s*\n\s*-\s*["']v\*["']/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /npm pack --json/);
  assert.match(workflow, /npm publish "\$TARBALL" --access public/);
  assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN/);
});

test("release metadata gate rejects a tag that differs from package version", async () => {
  await assert.rejects(
    () =>
      execFileAsync(
        process.execPath,
        [path.join(packageRoot, "scripts", "verify-release.mjs")],
        {
          cwd: packageRoot,
          encoding: "utf8",
          env: { ...process.env, GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "v9.9.9" },
        },
      ),
    (error) =>
      error.code !== 0 &&
      /does not match package version 0\.0\.1/.test(error.stderr),
  );
});

test("0.0.1 bootstrap is isolated from later Trusted Publishing releases", async () => {
  const bootstrap = await readFile(
    path.join(packageRoot, ".github", "workflows", "bootstrap-publish.yml"),
    "utf8",
  );
  const regular = await readFile(
    path.join(packageRoot, ".github", "workflows", "publish.yml"),
    "utf8",
  );

  assert.match(bootstrap, /tags:\s*\n\s*-\s*["']v0\.0\.1["']/);
  assert.match(bootstrap, /NPM_TOKEN_BOOTSTRAP/);
  assert.match(bootstrap, /--provenance/);
  assert.match(regular, /github\.ref_name != 'v0\.0\.1'/);
  assert.doesNotMatch(regular, /NODE_AUTH_TOKEN/);
});
