import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const cliPath = path.resolve("bin/k-teach.js");
async function runCli(args, cwd, env = process.env) {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd,
      encoding: "utf8",
      env,
    });
    return { ...result, exitCode: 0 };
  } catch (error) {
    return {
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
      exitCode: error.code,
    };
  }
}

test("init creates the Learning Project, initial Teach, and selected Agent Integration", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "k-teach-agent-init-"));
  const project = path.join(parent, "course");

  const result = await runCli(["init", project, "--tools", "codex"], parent);

  assert.equal(result.exitCode, 0);
  assert.equal(
    (await stat(path.join(project, "teachs", "main"))).isDirectory(),
    true,
  );
  assert.match(
    await readFile(path.join(project, ".k-teach", "config.yaml"), "utf8"),
    /schema_version: 1/,
  );
  const skill = await readFile(
    path.join(project, ".codex", "skills", "k-teach", "SKILL.md"),
    "utf8",
  );
  assert.equal(skill, await readFile(path.resolve("SKILL.md"), "utf8"));
  assert.match(skill, /k-teach generate --intent/);
  assert.doesNotMatch(skill, /node bin\/k-teach\.js/);
});

test("update repairs owned files and preserves the Learning Project and other Skills", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "k-teach-update-"));
  assert.equal(
    (await runCli(["init", "--tools", "codex"], project)).exitCode,
    0,
  );
  const configPath = path.join(project, ".k-teach", "config.yaml");
  const skillPath = path.join(
    project,
    ".codex",
    "skills",
    "k-teach",
    "SKILL.md",
  );
  const otherSkill = path.join(
    project,
    ".codex",
    "skills",
    "user-owned",
    "SKILL.md",
  );
  const customConfig = "schema_version: 1\noutput_dir: custom-output\n";
  await writeFile(configPath, customConfig);
  await writeFile(skillPath, "BROKEN GENERATED FILE\n");
  await mkdir(path.dirname(otherSkill), { recursive: true });
  await writeFile(otherSkill, "USER OWNED\n");

  const result = await runCli(["update"], project);

  assert.equal(result.exitCode, 0);
  assert.equal(await readFile(configPath, "utf8"), customConfig);
  assert.equal(await readFile(otherSkill, "utf8"), "USER OWNED\n");
  assert.equal(await readFile(skillPath, "utf8"), await readFile(path.resolve("SKILL.md"), "utf8"));

  const repeated = await runCli(["init", "--tools", "codex"], project);
  assert.equal(repeated.exitCode, 0);
  assert.equal(await readFile(configPath, "utf8"), customConfig);
});

test("non-interactive init without a detected or selected Agent leaves no partial workspace", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "k-teach-no-agent-"));

  const result = await runCli(["init"], project);

  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /No Agent tools were detected/);
  await assert.rejects(
    () => stat(path.join(project, ".k-teach")),
    (error) => error.code === "ENOENT",
  );
});

test("tools reports the complete Agent matrix from the pinned OpenSpec snapshot", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "k-teach-tools-"));
  const expectedIds = [
    "amazon-q",
    "antigravity",
    "auggie",
    "bob",
    "claude",
    "cline",
    "codeartsagent",
    "codex",
    "forgecode",
    "codebuddy",
    "continue",
    "costrict",
    "crush",
    "cursor",
    "factory",
    "gemini",
    "github-copilot",
    "hermes",
    "iflow",
    "junie",
    "kilocode",
    "kimi",
    "kiro",
    "lingma",
    "vibe",
    "oh-my-pi",
    "opencode",
    "pi",
    "qoder",
    "qwen",
    "roocode",
    "trae",
    "windsurf",
    "zcode",
    "workbuddy",
  ];

  const result = await runCli(["tools", "--json"], project);

  assert.equal(result.exitCode, 0);
  const tools = JSON.parse(result.stdout);
  assert.deepEqual(
    tools.map((tool) => tool.id),
    expectedIds,
  );
  assert.equal(new Set(tools.map((tool) => tool.id)).size, expectedIds.length);
  assert.ok(tools.every((tool) => !path.isAbsolute(tool.skills_dir)));
});

test("--tools all generates the canonical Skill for every registry target", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "k-teach-all-tools-"));
  const matrix = JSON.parse(
    (await runCli(["tools", "--json"], project)).stdout,
  );

  const result = await runCli(["init", "--tools", "all"], project);

  assert.equal(result.exitCode, 0, result.stderr);
  for (const tool of matrix) {
    const generated = path.join(
      project,
      tool.skills_dir,
      "skills",
      "k-teach",
      "SKILL.md",
    );
    assert.match(await readFile(generated, "utf8"), /name: k-teach/);
  }
});

test("invalid --tools input fails before writing project files", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "k-teach-invalid-tools-"));

  for (const value of ["codex,codex", "all,codex", "unknown-agent"]) {
    const result = await runCli(["init", "--tools", value], project);
    assert.equal(result.exitCode, 2);
  }
  await assert.rejects(
    () => stat(path.join(project, ".k-teach")),
    (error) => error.code === "ENOENT",
  );
});

test("Agent Integrations cannot be installed inside a Teach", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "k-teach-agent-guard-"));
  assert.equal(
    (await runCli(["init", "--tools", "none"], project)).exitCode,
    0,
  );
  const teachRoot = path.join(project, "teachs", "main");

  const result = await runCli(
    ["init", ".", "--tools", "codex"],
    teachRoot,
  );

  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /cannot be initialized as a Learning Project/);
  await assert.rejects(
    () => stat(path.join(teachRoot, ".codex")),
    (error) => error.code === "ENOENT",
  );
});

test("up-to-date update does not rewrite generated Agent files", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "k-teach-no-rewrite-"));
  assert.equal(
    (await runCli(["init", "--tools", "codex"], project)).exitCode,
    0,
  );
  const skillPath = path.join(
    project,
    ".codex",
    "skills",
    "k-teach",
    "SKILL.md",
  );
  const before = await stat(skillPath);
  await new Promise((resolve) => setTimeout(resolve, 25));

  const result = await runCli(["update"], project);

  assert.equal(result.exitCode, 0);
  assert.equal((await stat(skillPath)).mtimeMs, before.mtimeMs);
});

test("npx init explains that persistent Agent use needs the global CLI", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "k-teach-npx-"));

  const result = await runCli(["init", "--tools", "none"], project, {
    ...process.env,
    npm_command: "exec",
  });

  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /npm install -g k-teach@latest/);
});

test("init --yes installs detected Agents through .agents/skills canonical symlinks", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "k-teach-yes-"));
  await mkdir(path.join(project, ".codex"));

  const result = await runCli(["init", "--yes"], project);

  assert.equal(result.exitCode, 0, result.stderr);
  const canonical = path.join(project, ".agents", "skills", "k-teach", "SKILL.md");
  assert.equal((await stat(canonical)).isFile(), true);
  const link = path.join(project, ".codex", "skills", "k-teach");
  assert.equal((await lstat(link)).isSymbolicLink(), true);
  assert.equal(
    path.normalize(await readlink(link)),
    path.normalize("../../.agents/skills/k-teach"),
  );
  assert.equal(
    await readFile(path.join(link, "SKILL.md"), "utf8"),
    await readFile(canonical, "utf8"),
  );
});

test("init --copy materializes independent copies instead of symlinks", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "k-teach-copy-"));
  await mkdir(path.join(project, ".codex"));

  const result = await runCli(["init", "--tools", "codex", "--copy"], project);

  assert.equal(result.exitCode, 0, result.stderr);
  const link = path.join(project, ".codex", "skills", "k-teach");
  assert.equal((await lstat(link)).isSymbolicLink(), false);
  assert.equal((await stat(path.join(link, "SKILL.md"))).isFile(), true);
  assert.equal(
    (await stat(path.join(project, ".agents", "skills", "k-teach", "SKILL.md"))).isFile(),
    true,
  );
});

test("init --yes detects WorkBuddy when .workbuddy exists", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "k-teach-wb-"));
  await mkdir(path.join(project, ".workbuddy"));

  const result = await runCli(["init", "--yes"], project);

  assert.equal(result.exitCode, 0, result.stderr);
  const link = path.join(project, ".workbuddy", "skills", "k-teach");
  assert.equal((await lstat(link)).isSymbolicLink(), true);
  assert.equal(
    path.normalize(await readlink(link)),
    path.normalize("../../.agents/skills/k-teach"),
  );
  assert.equal((await stat(path.join(link, "SKILL.md"))).isFile(), true);
});

test("canonical Skill under .agents/skills carries references and agents", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "k-teach-canon-"));
  await mkdir(path.join(project, ".codex"));

  const result = await runCli(["init", "--tools", "codex"], project);
  assert.equal(result.exitCode, 0, result.stderr);
  const canonical = path.join(project, ".agents", "skills", "k-teach");
  assert.equal((await stat(path.join(canonical, "references"))).isDirectory(), true);
  assert.equal((await stat(path.join(canonical, "agents"))).isDirectory(), true);
});
