import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
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
import sharp from "sharp";

import { validateDocument } from "../src/schema.ts";

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

test("wechat render derives a validated article only from an explicit Publication Brief", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-wechat-"));
  assert.equal((await runCli(["init", "--tools", "none"], workspace)).exitCode, 0);
  const lesson = path.join(workspace, "teachs", "main", "lessons", "event-loop");
  await mkdir(path.join(lesson, "exercises"), { recursive: true });
  await mkdir(path.join(lesson, "media", "diagrams"), { recursive: true });
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
  - title: Node.js 事件循环文档
    url: https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick
composition: workshop
visuals: auto
`,
  );
  await writeFile(
    path.join(lesson, "lesson.md"),
    `# 理解事件循环

## 建立模型

同步代码执行结束后，运行时会处理不同队列中的任务。

> 先判断任务进入哪个队列，再预测执行顺序。

![事件循环处理流程](media/diagrams/request-flow.yaml)

## 不要发布

这是只属于本地课程的补充说明。

## 现在练习

{{exercise:predict}}
`,
  );
  await writeFile(
    path.join(lesson, "media", "diagrams", "request-flow.yaml"),
    `schema_version: 1
id: request-flow
title: 事件循环处理流程
description: 同步任务结束后进入队列处理。
kind: flow
direction: top-to-bottom
nodes:
  - id: sync
    label: 同步任务结束
    role: start
  - id: queue
    label: 处理队列
    role: end
edges:
  - from: sync
    to: queue
`,
  );
  await mkdir(path.join(lesson, "media", "generated"));
  await sharp({
    create: {
      width: 1200,
      height: 600,
      channels: 3,
      background: "#315c49",
    },
  })
    .png()
    .toFile(path.join(lesson, "media", "generated", "queue-cover.png"));
  await writeFile(
    path.join(lesson, "media", "visual-plan.yaml"),
    `schema_version: 1
id: event-loop-assets
lesson_id: event-loop-01
lesson_revision: 2026-07-27T00:00:00Z
assets:
  - id: queue-cover
    kind: cover
    purpose: 建立任务队列的第一印象
    prompt: 一本纸面学习手册中的事件循环队列。
    input_references:
      - lesson.md
`,
  );
  await writeFile(
    path.join(lesson, "media", "queue-cover.result.yaml"),
    `schema_version: 1
plan_id: event-loop-assets
asset_id: queue-cover
provider:
  id: example-provider
  model: image-model-v1
prompt: 一本纸面学习手册中的事件循环队列。
input_references:
  - lesson.md
output_path: generated/queue-cover.png
media_type: image/png
validation:
  status: passed
  checks:
    - reviewed-against-purpose
`,
  );
  assert.equal(
    (
      await runCli(
        [
          "visuals",
          "register",
          "--plan",
          path.join(lesson, "media", "visual-plan.yaml"),
          "--result",
          path.join(lesson, "media", "queue-cover.result.yaml"),
        ],
        workspace,
      )
    ).exitCode,
    0,
  );
  await writeFile(
    path.join(lesson, "exercises", "predict.yaml"),
    `schema_version: 1
id: predict
prompt: 哪个任务先执行？
answer: 微任务
feedback: 当前任务结束后先清空微任务队列。
`,
  );
  await writeFile(
    path.join(workspace, "teachs", "main", "publications", "event-loop-public.yaml"),
    `schema_version: 1
id: event-loop-public
revision: 2026-07-27T01:00:00Z
lesson_id: event-loop-01
lesson_revision: 2026-07-27T00:00:00Z
title: 先看队列，再理解事件循环
audience: 刚开始学习 JavaScript 异步机制的读者
angle: 用任务队列建立可预测的执行模型
include:
  - 建立模型
exclude:
  - 不要发布
  - 现在练习
theme: field-manual
author: K Teach
summary: 从任务所在的队列出发，建立可复用的事件循环判断方法。
cover:
  mode: visual-asset
  asset_id: queue-cover
authorized_for_publication: false
`,
  );

  const result = await runCli(
    ["wechat", "render", "--brief", "event-loop-public"],
    workspace,
  );

  assert.equal(result.exitCode, 0, result.stderr);
  const output = path.join(
    workspace,
    "teachs",
    "main",
    ".k-teach",
    "output",
    "wechat",
    "event-loop-public",
  );
  const article = await readFile(path.join(output, "article.html"), "utf8");
  const preview = await readFile(path.join(output, "preview.html"), "utf8");
  const manifest = JSON.parse(
    await readFile(path.join(output, "manifest.json"), "utf8"),
  );
  const cover = await stat(path.join(output, "cover", "cover.jpg"));

  assert.match(article, /^<section style=/);
  assert.match(article, /<span leaf="">/);
  assert.match(article, /建立模型/);
  assert.match(article, /src="KT_WECHAT_MEDIA_001"/);
  assert.match(article, /Node\.js 事件循环文档/);
  assert.doesNotMatch(article, /不要发布|现在练习|答案|学习进度/);
  assert.doesNotMatch(article, /<script|<style|<div|class=|id=/i);
  assert.doesNotMatch(article, /127\.0\.0\.1|localhost|lessons\/event-loop-01/);
  assert.match(preview, /复制正文/);
  assert.match(preview, /src="media\/request-flow\.png"/);
  assert.match(preview, /<script/);
  assert.ok((await stat(path.join(output, "media", "request-flow.png"))).size > 0);
  assert.ok(cover.size > 0 && cover.size < 64 * 1024);
  assert.equal(manifest.validation.errors.length, 0);
  assert.equal(manifest.validation.warnings.length, 0);
  assert.equal(manifest.validation.eligible_for_draft, true);
  assert.equal(manifest.publication_eligibility, false);
  assert.ok(manifest.capabilities_used.includes("visual-provider"));
  assert.equal(manifest.media[0].source, "visual-asset:queue-cover");
  assert.deepEqual(manifest.article, {
    title: "先看队列，再理解事件循环",
    author: "K Teach",
    digest: "从任务所在的队列出发，建立可复用的事件循环判断方法。",
  });
  assert.deepEqual(manifest.media[1], {
    kind: "diagram",
    placeholder: "KT_WECHAT_MEDIA_001",
    source: "lessons/event-loop/media/diagrams/request-flow.yaml",
    file: "media/request-flow.png",
    content_hash: manifest.media[1].content_hash,
  });
  assert.deepEqual(await validateDocument("wechat-artifact-manifest", manifest), []);
});
