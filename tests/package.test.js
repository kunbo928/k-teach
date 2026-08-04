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
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
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

test("the packaged Skill routes learning, WeChat, and PPT intents explicitly", async () => {
  const skill = await readFile(path.join(packageRoot, "SKILL.md"), "utf8");
  const routing = await readFile(
    path.join(packageRoot, "references", "output-intents.md"),
    "utf8",
  );

  assert.match(skill, /学习、公众号还是 PPT/);
  assert.match(skill, /generate --intent wechat/);
  assert.match(skill, /generate --intent ppt/);
  assert.match(skill, /Load one optional reference only/);
  assert.match(routing, /学习、公众号，还是 PPT/);
  assert.match(routing, /Do not call an HTML deck a `\.pptx`/);
  assert.match(routing, /must not\s+depend on another Agent Skill/);
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
      core: ["lesson-bundle", "context-packet", "semantic-plan", "generation-run", "content-addressed-cache", "web", "diagram", "presentation-brief", "ppt", "vite-project-preview"],
    optional: ["visual-provider", "wechat", "wechat-channel-themes", "wechat-multi-account"],
    visual_modes: ["auto", "required", "off"],
    teaching_themes: [
      "classic-manual",
      "storybook",
      "nature-explorer",
      "active-classroom",
      "junior-lab",
      "editorial-desk",
      "future-lab",
    ],
  });
  const version = await execFileAsync(
    process.execPath,
    [path.join(packageRoot, "bin", "k-teach.js"), "--version"],
    { cwd: workspace, encoding: "utf8" },
  );
  const manifest = JSON.parse(
    await readFile(path.join(packageRoot, "package.json"), "utf8"),
  );
  assert.equal(version.stdout.trim(), manifest.version);
});
