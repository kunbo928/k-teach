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
    await cp(
      path.join(packageRoot, "package.json"),
      path.join(fixtureRoot, "package.json"),
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

test("Changesets release workflow separates release PRs from OIDC publishing", async () => {
  const workflow = await readFile(
    path.join(packageRoot, ".github", "workflows", "release.yml"),
    "utf8",
  );

  assert.match(workflow, /branches:\s*\n\s*-\s*main/);
  assert.match(workflow, /contents:\s*write/);
  assert.match(workflow, /pull-requests:\s*write/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /environment:\s*npm/);
  assert.match(workflow, /node-version:\s*24/);
  assert.doesNotMatch(workflow, /npm install --global npm@latest/);
  assert.match(workflow, /pnpm install --frozen-lockfile/);
  assert.match(workflow, /id:\s*changesets/);
  assert.match(workflow, /uses:\s*changesets\/action@v1/);
  assert.match(workflow, /version:\s*pnpm changeset version/);
  assert.match(
    workflow,
    /github-token:\s*\$\{\{\s*secrets\.ACTIONS_PAT \|\| secrets\.GITHUB_TOKEN\s*\}\}/,
  );
  assert.match(
    workflow,
    /GITHUB_TOKEN:\s*\$\{\{\s*secrets\.ACTIONS_PAT \|\| secrets\.GITHUB_TOKEN\s*\}\}/,
  );
  assert.match(workflow, /ACTIONS_PAT/);
  assert.doesNotMatch(workflow, /^\s*token:\s*\$\{\{\s*secrets\.ACTIONS_PAT/);
  assert.match(
    workflow,
    /if:\s*steps\.changesets\.outputs\.hasChangesets == 'false'/,
  );
  assert.match(workflow, /run:\s*pnpm release/);
  assert.doesNotMatch(workflow, /^\s*publish:/m);
  assert.doesNotMatch(workflow, /NPM_TOKEN|NODE_AUTH_TOKEN/);
});

test("release metadata gate rejects a tag that differs from package version", async () => {
  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  );
  const versionPattern = manifest.version.replace(/\./g, "\\.");

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
      new RegExp(`does not match package version ${versionPattern}`).test(
        error.stderr,
      ),
  );
});

test("0.0.1 bootstrap is isolated from later Trusted Publishing releases", async () => {
  const bootstrap = await readFile(
    path.join(packageRoot, ".github", "workflows", "bootstrap-publish.yml"),
    "utf8",
  );
  const regular = await readFile(
    path.join(packageRoot, ".github", "workflows", "release.yml"),
    "utf8",
  );

  assert.match(bootstrap, /tags:\s*\n\s*-\s*["']v0\.0\.1["']/);
  assert.match(bootstrap, /NPM_TOKEN_BOOTSTRAP/);
  assert.match(bootstrap, /--provenance/);
  assert.match(bootstrap, /TARBALL="\$\(npm pack --silent\)"/);
  assert.match(bootstrap, /test -f "\$TARBALL"/);
  assert.doesNotMatch(bootstrap, /pack-result\.json|JSON\.parse/);
  assert.match(regular, /branches:\s*\n\s*-\s*main/);
  assert.doesNotMatch(regular, /tags:/);
  assert.doesNotMatch(regular, /NODE_AUTH_TOKEN/);
});

test("Changesets config treats k-teach as a public package on main", async () => {
  const config = JSON.parse(
    await readFile(path.join(packageRoot, ".changeset", "config.json"), "utf8"),
  );
  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  );

  assert.equal(config.access, "public");
  assert.equal(config.baseBranch, "main");
  assert.equal(config.commit, false);
  assert.equal(manifest.scripts.changeset, "changeset");
  assert.equal(manifest.scripts.version, "changeset version");
  assert.equal(manifest.scripts.release, "npm run build && changeset publish");
  assert.equal(manifest.devDependencies["@changesets/cli"], "2.31.1");
});
