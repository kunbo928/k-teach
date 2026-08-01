import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { validateDocument } from "../src/schema.ts";
import { TEACHING_THEMES } from "../src/teaching-themes.ts";

const execFileAsync = promisify(execFile);
const cliPath = path.resolve("bin/k-teach.js");

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

test("render ppt creates a self-contained HTML presentation from a Lesson Bundle", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-ppt-"));
  assert.equal(
    (await runCli(["init", "--tools", "none"], workspace)).exitCode,
    0,
  );
  const lesson = path.join(
    workspace,
    "teachs",
    "main",
    "lessons",
    "event-loop",
  );
  await mkdir(path.join(lesson, "exercises"), { recursive: true });
  await mkdir(path.join(lesson, "media"), { recursive: true });
  await writeFile(
    path.join(lesson, "lesson.yaml"),
    `schema_version: 1
id: event-loop-01
revision: 2026-07-31T00:00:00Z
title: 理解事件循环
mission: 能够解释一次异步任务的执行顺序
objectives:
  - 预测微任务与定时器的输出顺序
sources:
  - title: Node.js 事件循环文档
    url: https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick
composition: workshop
visuals: off
`,
  );
  await writeFile(
    path.join(lesson, "lesson.md"),
    `# 理解事件循环

## 建立模型

同步代码完成后，运行时按规则处理不同队列。

> 先判断任务进入哪个队列，再预测执行顺序。

## 现场判断

{{exercise:predict}}
`,
  );
  await writeFile(
    path.join(lesson, "exercises", "predict.yaml"),
    `schema_version: 1
id: predict
prompt: 微任务与定时器哪个先执行？
answer: 微任务
feedback: 当前任务结束后先清空微任务队列。
`,
  );

  const result = await runCli(
    [
      "render",
      "ppt",
      "--lesson",
      "event-loop-01",
      "--theme",
      "active-classroom",
    ],
    workspace,
  );
  assert.equal(result.exitCode, 0, result.stderr);
  const output = path.join(
    workspace,
    "teachs",
    "main",
    ".k-teach",
    "output",
    "ppt",
    "event-loop-01",
  );
  const html = await readFile(path.join(output, "index.html"), "utf8");
  const manifest = JSON.parse(
    await readFile(path.join(output, "manifest.json"), "utf8"),
  );

  assert.match(html, /aspect-ratio:16\/9/);
  assert.match(html, /data-theme="active-classroom"/);
  assert.match(html, /理解事件循环|建立模型/);
  assert.match(html, /微任务与定时器哪个先执行/);
  assert.match(html, /<aside class="notes">[\s\S]*微任务/);
  assert.match(html, /ArrowRight/);
  assert.match(html, /cycleTheme/);
  assert.match(html, /\.help,.theme-name\{[^}]*color:var\(--muted\)/);
  assert.match(html, /Slide overview|Presenter mode/);
  assert.match(html, /@media print/);
  assert.doesNotMatch(html, /https:\/\/cdn/i);
  assert.ok((await stat(path.join(output, "index.html"))).size > 5_000);
  assert.equal(manifest.channel, "ppt");
  assert.ok(manifest.capabilities_used.includes("theme:active-classroom"));
  assert.deepEqual(
    await validateDocument("artifact-manifest", manifest),
    [],
  );
});

test("render ppt implements every Teaching Theme as a selectable deck", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-ppt-themes-"));
  assert.equal(
    (await runCli(["init", "--tools", "none"], workspace)).exitCode,
    0,
  );
  const lesson = path.join(
    workspace,
    "teachs",
    "main",
    "lessons",
    "theme-catalog",
  );
  await mkdir(path.join(lesson, "exercises"), { recursive: true });
  await mkdir(path.join(lesson, "media"), { recursive: true });
  await writeFile(
    path.join(lesson, "lesson.yaml"),
    `schema_version: 1
id: theme-catalog
revision: 2026-07-31T00:00:00Z
title: 主题目录
mission: 验证全部授课主题
objectives:
  - 比较主题视觉语言
sources: []
composition: reading
visuals: off
`,
  );
  await writeFile(
    path.join(lesson, "lesson.md"),
    "# 主题目录\n\n## 同一内容\n\n每套主题都必须真实渲染。\n",
  );

  for (const theme of TEACHING_THEMES) {
    const result = await runCli(
      ["render", "ppt", "--lesson", "theme-catalog", "--theme", theme.id],
      workspace,
    );
    assert.equal(result.exitCode, 0, `${theme.id}: ${result.stderr}`);
    const output = path.join(
      workspace,
      "teachs",
      "main",
      ".k-teach",
      "output",
      "ppt",
      "theme-catalog",
    );
    const html = await readFile(path.join(output, "index.html"), "utf8");
    const manifest = JSON.parse(
      await readFile(path.join(output, "manifest.json"), "utf8"),
    );
    assert.match(html, new RegExp(`data-theme="${theme.id}"`));
    assert.match(html, new RegExp(theme.colors.accent, "i"));
    assert.ok(manifest.capabilities_used.includes(`theme:${theme.id}`));
  }
});
