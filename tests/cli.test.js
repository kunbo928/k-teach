import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const cliPath = path.resolve("bin/k-teach.js");
const fixturesPath = path.resolve("tests/fixtures");

async function runCli(args, cwd) {
  try {
    const result = await execFileAsync(process.execPath, [cliPath, ...args], {
      cwd,
      encoding: "utf8",
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

test("init creates a valid learning workspace without overwriting content", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-init-"));

  const first = await runCli(["init"], workspace);

  assert.equal(first.exitCode, 0);
  assert.match(first.stdout, /Learning Workspace created/);
  assert.equal((await stat(path.join(workspace, "lessons"))).isDirectory(), true);
  assert.equal((await stat(path.join(workspace, "publications"))).isDirectory(), true);
  assert.equal(
    (await stat(path.join(workspace, "learning-records"))).isDirectory(),
    true,
  );
  assert.equal((await stat(path.join(workspace, "reference"))).isDirectory(), true);
  assert.match(
    await readFile(path.join(workspace, "MISSION.md"), "utf8"),
    /Success looks like/,
  );
  assert.match(
    await readFile(path.join(workspace, "RESOURCES.md"), "utf8"),
    /## Knowledge/,
  );
  assert.match(
    await readFile(path.join(workspace, "GLOSSARY.md"), "utf8"),
    /## Terms/,
  );
  assert.match(
    await readFile(path.join(workspace, "NOTES.md"), "utf8"),
    /stable teaching preferences/i,
  );
  assert.match(
    await readFile(path.join(workspace, "k-teach.yaml"), "utf8"),
    /schema_version: 1/,
  );

  const second = await runCli(["init"], workspace);
  assert.equal(second.exitCode, 2);
  assert.match(second.stderr, /invalid-workspace/);
});

test("capabilities reports deterministic core and optional boundaries", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-capabilities-"));

  const result = await runCli(["capabilities", "--json"], workspace);

  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    core: ["lesson-bundle", "web", "diagram"],
    optional: ["visual-provider", "wechat"],
    visual_modes: ["auto", "required", "off"],
  });
});

test("validate accepts an initialized workspace and reports invalid schema versions", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-validate-"));
  assert.equal((await runCli(["init"], workspace)).exitCode, 0);

  const valid = await runCli(["validate"], workspace);
  assert.equal(valid.exitCode, 0);
  assert.match(valid.stdout, /Learning Workspace is valid/);

  await writeFile(
    path.join(workspace, "k-teach.yaml"),
    "schema_version: 99\nvisuals: auto\n",
  );
  const invalid = await runCli(["validate"], workspace);
  assert.equal(invalid.exitCode, 2);
  assert.match(invalid.stderr, /invalid-workspace/);
});

test("validate detects a legacy teaching workspace and gives migration steps", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-legacy-"));
  await cp(path.join(fixturesPath, "legacy-workspace"), workspace, {
    recursive: true,
  });

  const result = await runCli(["validate"], workspace);

  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /legacy Learning Workspace detected/);
  assert.match(result.stderr, /k-teach migrate --dry-run/);
  assert.doesNotMatch(result.stderr, /0001-event-loop\.html.*deleted/i);

  const preview = await runCli(["migrate", "--dry-run"], workspace);
  assert.equal(preview.exitCode, 0);
  assert.match(preview.stdout, /0001-event-loop\.html/);
  assert.match(preview.stdout, /lessons\/0001-event-loop\/lesson\.yaml/);
  await assert.rejects(
    () => stat(path.join(workspace, "k-teach.yaml")),
    (error) => error.code === "ENOENT",
  );
});

test("validate checks each semantic Lesson Bundle", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-bundle-"));
  assert.equal((await runCli(["init"], workspace)).exitCode, 0);
  const lesson = path.join(workspace, "lessons", "0001-event-loop");
  await mkdir(path.join(lesson, "exercises"), { recursive: true });
  await mkdir(path.join(lesson, "media"), { recursive: true });
  await writeFile(path.join(lesson, "lesson.md"), "# 事件循环\n\n预测输出。");
  await writeFile(
    path.join(lesson, "lesson.yaml"),
    `schema_version: 1
id: event-loop-01
revision: 2026-07-27T00:00:00Z
title: 理解事件循环
mission: 能够解释一次异步任务的执行顺序
objectives:
  - 预测微任务与定时器的输出顺序
sources:
  - title: Node.js docs
    url: https://nodejs.org/
composition: workshop
visuals: "off"
`,
  );

  const valid = await runCli(["validate"], workspace);
  assert.equal(valid.exitCode, 0);

  await writeFile(
    path.join(lesson, "lesson.yaml"),
    "schema_version: 1\nid: event-loop-01\n",
  );
  const invalid = await runCli(["validate"], workspace);
  assert.equal(invalid.exitCode, 2);
  assert.match(invalid.stderr, /invalid-bundle/);
  assert.match(invalid.stderr, /missing required property: mission/);
});

test("render web creates a Field Manual course and a no-JS lesson", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-web-"));
  assert.equal((await runCli(["init"], workspace)).exitCode, 0);
  const lesson = path.join(workspace, "lessons", "0001-event-loop");
  await mkdir(path.join(lesson, "exercises"), { recursive: true });
  await mkdir(path.join(lesson, "media"), { recursive: true });
  await writeFile(
    path.join(lesson, "lesson.md"),
    `# 事件循环\n\n## 先预测\n\n不要运行代码，先写出输出顺序。\n\n## 建立模型\n\n任务进入不同队列，执行顺序由运行时规则决定。\n`,
  );
  await writeFile(
    path.join(lesson, "lesson.yaml"),
    `schema_version: 1
id: event-loop-01
revision: 2026-07-27T00:00:00Z
title: 理解事件循环
mission: 能够解释一次异步任务的执行顺序
objectives:
  - 预测微任务与定时器的输出顺序
sources:
  - title: Node.js docs
    url: https://nodejs.org/
composition: workshop
visuals: "off"
`,
  );
  await writeFile(
    path.join(lesson, "exercises", "0001-predict.yaml"),
    `schema_version: 1
id: predict-order
prompt: Promise 回调和 setTimeout 哪个先执行？
answer: Promise 回调先执行。
feedback: 当前同步任务结束后先清空微任务队列。
`,
  );

  const result = await runCli(["render", "web"], workspace);
  assert.equal(result.exitCode, 0);
  const output = path.join(workspace, ".k-teach", "output", "web");
  const index = await readFile(path.join(output, "index.html"), "utf8");
  const page = await readFile(
    path.join(output, "lessons", "event-loop-01.html"),
    "utf8",
  );
  const css = await readFile(path.join(output, "assets", "field-manual.css"), "utf8");

  assert.match(index, /理解事件循环/);
  assert.match(page, /class="lesson mode-workshop"/);
  assert.match(page, /<noscript>/);
  assert.match(page, /<details class="answer-disclosure"/);
  assert.match(page, /data-theme-toggle/);
  assert.match(css, /@media print/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.doesNotMatch(page, /—|–/);
});
