import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(".");

test("build progress does not contaminate machine-readable stdout", async () => {
  const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), "k-teach-build-"));

  try {
    await mkdir(path.join(fixtureRoot, "scripts"));
    await cp(
      path.join(packageRoot, "scripts", "build.mjs"),
      path.join(fixtureRoot, "scripts", "build.mjs"),
    );
    await cp(path.join(packageRoot, "src"), path.join(fixtureRoot, "src"), {
      recursive: true,
    });

    const result = await execFileAsync(
      process.execPath,
      [path.join(fixtureRoot, "scripts", "build.mjs")],
      {
        cwd: fixtureRoot,
        encoding: "utf8",
      },
    );

    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Built \d+ modules in dist\/\.\n$/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("tarball verification reads the archive without npm JSON assumptions", async () => {
  const verifier = await readFile(
    path.join(packageRoot, "scripts", "verify-tarball.mjs"),
    "utf8",
  );

  assert.match(verifier, /execFileAsync\("tar", \["-tzf", tarball\]/);
  assert.doesNotMatch(verifier, /npm.*pack.*--json|JSON\.parse/);
});

test("release workflow uses tags, OIDC, frozen installs, and the verified tarball", async () => {
  const workflow = await readFile(
    path.join(packageRoot, ".github", "workflows", "publish.yml"),
    "utf8",
  );

  assert.match(workflow, /tags:\s*\n\s*-\s*["']v\*["']/);
  assert.match(workflow, /contents:\s*read/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /TARBALL="\$\(npm pack --silent\)"/);
  assert.match(workflow, /test -f "\$TARBALL"/);
  assert.doesNotMatch(workflow, /pack-result\.json|JSON\.parse/);
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
      /does not match package version 0\.2\.0/.test(error.stderr),
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
  assert.match(bootstrap, /TARBALL="\$\(npm pack --silent\)"/);
  assert.match(bootstrap, /test -f "\$TARBALL"/);
  assert.doesNotMatch(bootstrap, /pack-result\.json|JSON\.parse/);
  assert.match(regular, /github\.ref_name != 'v0\.0\.1'/);
  assert.doesNotMatch(regular, /NODE_AUTH_TOKEN/);
});
