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

  const first = await runCli(["init", "--tools", "none"], workspace);

  assert.equal(first.exitCode, 0);
  assert.match(first.stdout, /Learning Workspace and Agent Integrations created/);
  assert.equal((await stat(path.join(workspace, "k-teach", "lessons"))).isDirectory(), true);
  assert.equal((await stat(path.join(workspace, "k-teach", "publications"))).isDirectory(), true);
  assert.equal(
    (await stat(path.join(workspace, "k-teach", "learning-records"))).isDirectory(),
    true,
  );
  assert.equal((await stat(path.join(workspace, "k-teach", "reference"))).isDirectory(), true);
  assert.match(
    await readFile(path.join(workspace, "k-teach", "MISSION.md"), "utf8"),
    /Success looks like/,
  );
  assert.match(
    await readFile(path.join(workspace, "k-teach", "RESOURCES.md"), "utf8"),
    /## Knowledge/,
  );
  assert.match(
    await readFile(path.join(workspace, "k-teach", "GLOSSARY.md"), "utf8"),
    /## Terms/,
  );
  assert.match(
    await readFile(path.join(workspace, "k-teach", "NOTES.md"), "utf8"),
    /stable teaching preferences/i,
  );
  assert.match(
    await readFile(path.join(workspace, "k-teach", "config.yaml"), "utf8"),
    /schema_version: 1/,
  );

  const second = await runCli(["init", "--tools", "none"], workspace);
  assert.equal(second.exitCode, 0);
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
  assert.equal((await runCli(["init", "--tools", "none"], workspace)).exitCode, 0);

  const valid = await runCli(["validate"], workspace);
  assert.equal(valid.exitCode, 0);
  assert.match(valid.stdout, /Learning Workspace is valid/);

  await writeFile(
    path.join(workspace, "k-teach", "config.yaml"),
    "schema_version: 99\nvisuals: auto\n",
  );
  const invalid = await runCli(["validate"], workspace);
  assert.equal(invalid.exitCode, 2);
  assert.match(invalid.stderr, /invalid-workspace/);
});

test("validate rejects a legacy teaching workspace without modifying it", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-legacy-"));
  await cp(path.join(fixturesPath, "legacy-workspace"), workspace, {
    recursive: true,
  });

  const result = await runCli(["validate"], workspace);

  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /unsupported legacy Learning Workspace detected/);
  assert.doesNotMatch(result.stderr, /migrate/);
  assert.doesNotMatch(result.stderr, /0001-event-loop\.html.*deleted/i);

  await assert.rejects(
    () => stat(path.join(workspace, "k-teach", "config.yaml")),
    (error) => error.code === "ENOENT",
  );
});

test("validate checks each semantic Lesson Bundle", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-bundle-"));
  assert.equal((await runCli(["init", "--tools", "none"], workspace)).exitCode, 0);
  const lesson = path.join(workspace, "k-teach", "lessons", "0001-event-loop");
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

test("validate rejects exercise files that the Web renderer cannot consume", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-exercises-"));
  assert.equal((await runCli(["init", "--tools", "none"], workspace)).exitCode, 0);
  const lesson = path.join(workspace, "k-teach", "lessons", "0001-practice");
  await mkdir(path.join(lesson, "exercises"), { recursive: true });
  await mkdir(path.join(lesson, "media"), { recursive: true });
  await writeFile(path.join(lesson, "lesson.md"), "# 练习\n\n先独立作答。");
  await writeFile(
    path.join(lesson, "lesson.yaml"),
    `schema_version: 1
id: practice-01
revision: 2026-07-27T00:00:00Z
title: 结构化练习
mission: 完成一次带反馈的练习
objectives:
  - 提交答案并获得具体反馈
sources:
  - title: Example
    url: https://example.com/
composition: workshop
visuals: "off"
`,
  );
  await writeFile(
    path.join(lesson, "exercises", "answers.md"),
    "# 答案\n\n这个文件不会被 Web Renderer 读取。",
  );

  const result = await runCli(["validate"], workspace);

  assert.equal(result.exitCode, 2);
  assert.match(result.stderr, /unsupported files: answers\.md/);
  assert.match(result.stderr, /Markdown exercise files are not rendered/);
});

test("render web creates a Field Manual course and a no-JS lesson", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-web-"));
  assert.equal((await runCli(["init", "--tools", "none"], workspace)).exitCode, 0);
  const lesson = path.join(workspace, "k-teach", "lessons", "0001-event-loop");
  await mkdir(path.join(lesson, "exercises"), { recursive: true });
  await mkdir(path.join(lesson, "media"), { recursive: true });
  await writeFile(
    path.join(lesson, "lesson.md"),
    `# 事件循环

## 先预测

不要运行代码，先写出输出顺序。

行内公式 $a^2 + b^2$ 应当保持在正文中。

$$
|\\mathbf{a} \\cdot \\mathbf{b}| \\le \\lVert\\mathbf{a}\\rVert \\cdot \\lVert\\mathbf{b}\\rVert
$$

![事件循环队列关系](media/diagrams/event-loop.svg)

{{asset:queue-diagram}}

{{asset:queue-lab}}

{{asset:lesson-audio}}

{{exercise:predict-order}}

## 建立模型

任务进入不同队列，执行顺序由运行时规则决定。
`,
  );
  await mkdir(path.join(lesson, "media", "diagrams"), { recursive: true });
  await writeFile(
    path.join(lesson, "media", "diagrams", "event-loop.svg"),
    `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title">
  <title id="title">事件循环队列关系</title>
  <rect width="120" height="60"/>
</svg>
`,
  );
  await mkdir(path.join(lesson, "media", "interactives"), { recursive: true });
  await writeFile(
    path.join(lesson, "media", "interactives", "queue-lab.html"),
    "<!doctype html><title>队列实验</title><button>推进一步</button>",
  );
  await mkdir(path.join(lesson, "media", "audio"), { recursive: true });
  await writeFile(
    path.join(lesson, "media", "audio", "lesson.mp3"),
    "fixture-audio",
  );
  await writeFile(
    path.join(lesson, "media", "assets.yaml"),
    `schema_version: 1
lesson_id: event-loop-01
lesson_revision: 2026-07-27T00:00:00Z
assets:
  - id: queue-diagram
    kind: diagram
    source: media/diagrams/event-loop.svg
    title: 队列关系
    description: 同步任务结束后先处理微任务队列。
  - id: queue-lab
    kind: interactive
    source: media/interactives/queue-lab.html
    title: 队列实验
    description: 逐步推进任务并观察队列变化。
  - id: lesson-audio
    kind: audio
    source: media/audio/lesson.mp3
    title: 本课语音
    description: 事件循环核心讲解。
    transcript: 同步任务结束后，运行时先清空微任务队列。
`,
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
  const output = path.join(workspace, "k-teach", ".k-teach", "output", "web");
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
  assert.match(page, /class="katex"/);
  assert.match(page, /class="katex-display"/);
  assert.match(page, /aria-hidden="true"/);
  assert.match(page, /a\^2 \+ b\^2/);
  assert.match(
    page,
    /<figure class="lesson-figure">[\s\S]*<img src="\.\.\/media\/event-loop-01\/diagrams\/event-loop\.svg" alt="事件循环队列关系" loading="lazy">[\s\S]*<figcaption>事件循环队列关系<\/figcaption>/,
  );
  assert.match(page, /class="lesson-figure interactive-asset"/);
  assert.match(page, /sandbox="allow-scripts"/);
  assert.match(page, /class="lesson-figure audio-asset"/);
  assert.match(page, /<audio controls preload="metadata"/);
  assert.match(page, /阅读语音文字稿/);
  assert.doesNotMatch(page, /\{\{asset:/);
  assert.doesNotMatch(page, /\$\$/);
  assert.match(
    await readFile(
      path.join(
        output,
        "media",
        "event-loop-01",
        "diagrams",
        "event-loop.svg",
      ),
      "utf8",
    ),
    /<title id="title">事件循环队列关系<\/title>/,
  );
  assert.match(css, /@media print/);
  assert.match(css, /@media \(max-width: 767px\)/);
  assert.doesNotMatch(page, /—|–/);
});
