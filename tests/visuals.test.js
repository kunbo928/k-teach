import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

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

test("Learning Asset Plan schema captures purpose, prompt, and authoritative references", async () => {
  const plan = {
    schema_version: 1,
    id: "event-loop-assets",
    lesson_id: "event-loop-01",
    lesson_revision: "2026-07-27T00:00:00Z",
    assets: [
      {
        id: "queue-cover",
        kind: "cover",
        purpose: "建立任务队列的第一印象",
        prompt: "一本纸面学习手册中的事件循环队列，克制绿色，留出标题空间。",
        input_references: ["lesson.md", "lesson.yaml#objectives"],
      },
    ],
  };

  assert.deepEqual(await validateDocument("learning-asset-plan", plan), []);
});

test("visuals register validates and records a provider result without invoking a model", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-visual-"));
  assert.equal((await runCli(["init", "--tools", "none"], workspace)).exitCode, 0);
  const media = path.join(workspace, "k-teach", "lessons", "event-loop", "media");
  await mkdir(path.join(media, "generated"), { recursive: true });
  const planPath = path.join(media, "visual-plan.yaml");
  const resultPath = path.join(media, "queue-cover.result.yaml");
  await writeFile(
    planPath,
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
      - lesson.yaml#objectives
`,
  );
  await writeFile(
    path.join(media, "generated", "queue-cover.png"),
    "provider-owned-image-bytes",
  );
  await writeFile(
    resultPath,
    `schema_version: 1
plan_id: event-loop-assets
asset_id: queue-cover
provider:
  id: example-provider
  model: image-model-v1
prompt: 一本纸面学习手册中的事件循环队列。
input_references:
  - lesson.md
  - lesson.yaml#objectives
output_path: generated/queue-cover.png
media_type: image/png
validation:
  status: passed
  checks:
    - file-readable
    - reviewed-against-purpose
`,
  );

  const result = await runCli(
    ["visuals", "register", "--plan", planPath, "--result", resultPath],
    workspace,
  );

  assert.equal(result.exitCode, 0, result.stderr);
  assert.match(result.stdout, /Visual asset registered/);
  const record = JSON.parse(
    await readFile(
      path.join(
        workspace,
        "k-teach",
        ".k-teach",
        "artifacts",
        "visuals",
        "event-loop-assets",
        "queue-cover.json",
      ),
      "utf8",
    ),
  );
  assert.equal(record.provider.id, "example-provider");
  assert.equal(record.provider.model, "image-model-v1");
  assert.equal(record.prompt, "一本纸面学习手册中的事件循环队列。");
  assert.deepEqual(record.input_references, [
    "lesson.md",
    "lesson.yaml#objectives",
  ]);
  assert.equal(record.output_path, "lessons/event-loop/media/generated/queue-cover.png");
  assert.match(record.content_hash, /^[a-f0-9]{64}$/);
  assert.deepEqual(await validateDocument("visual-asset-record", record), []);

  await mkdir(path.join(workspace, "k-teach", "lessons", "event-loop", "exercises"));
  await writeFile(
    path.join(workspace, "k-teach", "lessons", "event-loop", "lesson.md"),
    "# 事件循环\n\n先建立模型。\n",
  );
  await writeFile(
    path.join(workspace, "k-teach", "lessons", "event-loop", "lesson.yaml"),
    `schema_version: 1
id: event-loop-01
revision: 2026-07-27T00:00:00Z
title: 理解事件循环
mission: 能够解释一次异步任务的执行顺序
objectives:
  - 预测微任务与定时器的输出顺序
sources: []
composition: workshop
visuals: required
`,
  );
  await writeFile(
    path.join(media, "generated", "queue-cover.png"),
    "mutated-after-registration",
  );
  const stale = await runCli(["render", "web"], workspace);
  assert.equal(stale.exitCode, 2);
  assert.match(stale.stderr, /render-failed/);
  assert.match(stale.stderr, /content.*changed/i);
});

test("render web degrades visuals=auto with a tracked warning when no provider result exists", async () => {
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-auto-"));
  assert.equal((await runCli(["init", "--tools", "none"], workspace)).exitCode, 0);
  const lesson = path.join(workspace, "k-teach", "lessons", "event-loop");
  await mkdir(path.join(lesson, "exercises"), { recursive: true });
  await mkdir(path.join(lesson, "media"), { recursive: true });
  await writeFile(path.join(lesson, "lesson.md"), "# 事件循环\n\n先建立模型。\n");
  await writeFile(
    path.join(lesson, "lesson.yaml"),
    `schema_version: 1
id: event-loop-01
revision: 2026-07-27T00:00:00Z
title: 理解事件循环
mission: 能够解释一次异步任务的执行顺序
objectives:
  - 预测微任务与定时器的输出顺序
sources: []
composition: workshop
visuals: auto
`,
  );
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

  const rendered = await runCli(["render", "web"], workspace);

  assert.equal(rendered.exitCode, 0, rendered.stderr);
  const manifest = JSON.parse(
    await readFile(
      path.join(workspace, "k-teach", ".k-teach", "output", "web", "artifact-manifest.json"),
      "utf8",
    ),
  );
  assert.deepEqual(manifest.capabilities_used, ["lesson-bundle", "web"]);
  assert.deepEqual(manifest.warnings, [
    "event-loop-01: optional visual queue-cover unavailable; rendered without it.",
  ]);
});

test("render web fails required visuals and cleanly skips off visuals without a provider", async () => {
  async function createWorkspace(mode) {
    const workspace = await mkdtemp(path.join(tmpdir(), `k-teach-${mode}-`));
    assert.equal((await runCli(["init", "--tools", "none"], workspace)).exitCode, 0);
    const lesson = path.join(workspace, "k-teach", "lessons", "event-loop");
    await mkdir(path.join(lesson, "exercises"), { recursive: true });
    await mkdir(path.join(lesson, "media"), { recursive: true });
    await writeFile(path.join(lesson, "lesson.md"), "# 事件循环\n\n先建立模型。\n");
    await writeFile(
      path.join(lesson, "lesson.yaml"),
      `schema_version: 1
id: event-loop-01
revision: 2026-07-27T00:00:00Z
title: 理解事件循环
mission: 能够解释一次异步任务的执行顺序
objectives:
  - 预测微任务与定时器的输出顺序
sources: []
composition: workshop
visuals: ${mode}
`,
    );
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
    return workspace;
  }

  const requiredWorkspace = await createWorkspace("required");
  const required = await runCli(["render", "web"], requiredWorkspace);
  assert.equal(required.exitCode, 2);
  assert.match(required.stderr, /missing-capability/);
  assert.match(required.stderr, /queue-cover/);

  const offWorkspace = await createWorkspace("off");
  const off = await runCli(["render", "web"], offWorkspace);
  assert.equal(off.exitCode, 0, off.stderr);
  const manifest = JSON.parse(
    await readFile(
      path.join(
        offWorkspace,
        "k-teach",
        ".k-teach",
        "output",
        "web",
        "artifact-manifest.json",
      ),
      "utf8",
    ),
  );
  assert.deepEqual(manifest.warnings, []);
});
