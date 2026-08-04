import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

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
    return { stdout: error.stdout ?? "", stderr: error.stderr ?? "", exitCode: error.code };
  }
}

async function fixture() {
  const project = await mkdtemp(path.join(tmpdir(), "k-teach-context-"));
  assert.equal((await runCli(["init", "--tools", "none"], project)).exitCode, 0);
  const teach = path.join(project, "teachs", "main");
  await cp(
    path.resolve("tests/fixtures/web-course/lessons/0002-workshop"),
    path.join(teach, "lessons", "0002-workshop"),
    { recursive: true },
  );
  await mkdir(path.join(teach, "presentations"), { recursive: true });
  await writeFile(
    path.join(teach, "teach.yaml"),
    "schema_version: 1\nid: main\ntitle: 事件循环课程\ntheme_default: classic-manual\n",
  );
  await writeFile(
    path.join(teach, "publications", "queue-public.yaml"),
    `schema_version: 2
id: queue-public
revision: 2026-08-04T00:01:00Z
lesson_id: predict-queue-order
lesson_revision: 2026-07-27T02:00:00Z
title: 为什么异步输出顺序容易猜错
audience: JavaScript 初学者
angle: 从反直觉输出建立事件循环模型
include:
  - 不要先运行
  - 写出理由
exclude: []
channel_theme: emerald-editorial
article_type: analysis
author: K Teach
summary: 先预测，再解释运行时如何选择任务。
cover:
  mode: generated
authorized_for_publication: false
`,
  );
  return { project, teach };
}

test("context CLI emits one stable privacy-filtered WeChat Context Packet", async () => {
  const { teach } = await fixture();
  const args = ["context", "--intent", "wechat", "--lesson", "predict-queue-order", "--brief", "queue-public", "--json"];
  const first = await runCli(args, teach);
  assert.equal(first.exitCode, 0, first.stderr);
  assert.equal(first.stderr, "");
  const packet = JSON.parse(first.stdout);
  assert.equal(packet.intent, "wechat");
  assert.deepEqual(packet.sections.map((section) => section.heading), ["不要先运行", "写出理由"]);
  assert.ok(packet.sections.every((section) => section.id && section.blocks.every((block) => block.id)));
  assert.doesNotMatch(first.stdout, /predict-basic-order|三行输出|同步，微任务，定时器|feedback/i);
  assert.match(packet.provenance.input_hash, /^[a-f0-9]{64}$/);
  assert.match(packet.provenance.planning_hash, /^[a-f0-9]{64}$/);

  const second = await runCli(args, teach);
  assert.equal(second.stdout, first.stdout);

  const briefPath = path.join(teach, "publications", "queue-public.yaml");
  await writeFile(
    briefPath,
    (await readFile(briefPath, "utf8")).replace("emerald-editorial", "graphite-minimal"),
  );
  const themed = JSON.parse((await runCli(args, teach)).stdout);
  assert.notEqual(themed.provenance.input_hash, packet.provenance.input_hash);
  assert.equal(themed.provenance.planning_hash, packet.provenance.planning_hash);
});

test("context CLI emits intent-specific Learn and PPT packets", async () => {
  const { teach } = await fixture();
  const learn = await runCli(["context", "--intent", "learn", "--lesson", "predict-queue-order", "--json"], teach);
  assert.equal(learn.exitCode, 0, learn.stderr);
  const learnPacket = JSON.parse(learn.stdout);
  assert.deepEqual(learnPacket.route, {});
  assert.ok(learnPacket.sections.flatMap((section) => section.blocks).some((block) => block.kind === "exercise"));

  await writeFile(
    path.join(teach, "presentations", "queue-class.yaml"),
    `schema_version: 1
id: queue-class
revision: 2026-08-04T00:02:00Z
purpose: teaching
audience: JavaScript 初学者
learner_stage: 初学者
duration_minutes: 20
lesson_id: predict-queue-order
lesson_revision: 2026-07-27T02:00:00Z
include:
  - 写出理由
exclude: []
theme:
  id: active-classroom
  source: brief
  reason: 适合课堂练习
`,
  );
  const ppt = await runCli(["context", "--intent", "ppt", "--lesson", "predict-queue-order", "--brief", "queue-class", "--json"], teach);
  assert.equal(ppt.exitCode, 0, ppt.stderr);
  const pptPacket = JSON.parse(ppt.stdout);
  assert.deepEqual(pptPacket.sections.map((section) => section.heading), ["写出理由"]);
  assert.equal(pptPacket.route.id, "queue-class");
});

test("context CLI rejects stale authority without leaking a packet", async () => {
  const { teach } = await fixture();
  const briefPath = path.join(teach, "publications", "queue-public.yaml");
  await writeFile(briefPath, (await readFile(briefPath, "utf8")).replace("2026-07-27T02:00:00Z", "stale-secret-revision"));
  const result = await runCli(["context", "--intent", "wechat", "--lesson", "predict-queue-order", "--brief", "queue-public", "--json"], teach);
  assert.equal(result.exitCode, 2);
  assert.equal(result.stdout, "");
  assert.doesNotMatch(result.stderr, /三行输出|同步，微任务，定时器/);
});

test("generate CLI emits a clean resumable JSON state loop", async () => {
  const { teach } = await fixture();
  const args = ["generate", "--intent", "wechat", "--brief", "queue-public", "--json"];
  const first = await runCli(args, teach);
  assert.equal(first.exitCode, 0, first.stderr);
  assert.equal(first.stderr, "");
  assert.equal(JSON.parse(first.stdout).state, "needs_plan");
  assert.equal(first.stdout.trim().split("\n").length, 1);

  const second = await runCli(args, teach);
  assert.equal(second.exitCode, 0, second.stderr);
  const completed = JSON.parse(second.stdout);
  assert.equal(completed.state, "complete");
  assert.ok(completed.refs.artifact);
  const third = await runCli(args, teach);
  assert.equal(third.stdout, second.stdout);
});

test("Learn generation completes directly without creating a semantic Plan", async () => {
  const { teach } = await fixture();
  const result = await runCli(["generate", "--intent", "learn", "--lesson", "predict-queue-order", "--json"], teach);
  assert.equal(result.exitCode, 0, result.stderr);
  const completed = JSON.parse(result.stdout);
  assert.equal(completed.state, "complete");
  assert.equal(completed.refs.plan, null);
  assert.match(completed.refs.artifact, /^web-/);
  const inspected = await runCli(["inspect", "--run", completed.run_id, "--json"], teach);
  assert.equal(inspected.exitCode, 0, inspected.stderr);
  assert.deepEqual(JSON.parse(inspected.stdout), completed);
  const explained = await runCli(["explain", "--run", completed.run_id], teach);
  assert.match(explained.stdout, /State: complete/);
});

test("PPT generation resumes through a Slide Plan and returns an artifact id", async () => {
  const { teach } = await fixture();
  await writeFile(path.join(teach, "presentations", "queue-class.yaml"), `schema_version: 1
id: queue-class
revision: 2026-08-04T00:02:00Z
purpose: teaching
audience: JavaScript 初学者
duration_minutes: 20
lesson_id: predict-queue-order
lesson_revision: 2026-07-27T02:00:00Z
include: [不要先运行, 写出理由]
exclude: []
theme:
  id: active-classroom
  source: brief
  reason: 适合课堂练习
`);
  const args = ["generate", "--intent", "ppt", "--brief", "queue-class", "--json"];
  assert.equal(JSON.parse((await runCli(args, teach)).stdout).state, "needs_plan");
  const completed = JSON.parse((await runCli(args, teach)).stdout);
  assert.equal(completed.state, "complete");
  assert.match(completed.refs.artifact, /^ppt-/);
});

test("generate --draft fails structurally when account-scoped authority is absent", async () => {
  const { teach } = await fixture();
  const args = ["generate", "--intent", "wechat", "--brief", "queue-public", "--draft", "--json"];
  assert.equal(JSON.parse((await runCli(args, teach)).stdout).state, "needs_plan");
  const result = await runCli(args, teach);
  assert.equal(result.exitCode, 2);
  assert.equal(result.stderr, "");
  assert.equal(JSON.parse(result.stdout).state, "failed");
  assert.doesNotMatch(result.stdout, /APP_SECRET|appSecret|credential/i);
});

test("Publication Brief V1 fails with migration-required and no compatibility output", async () => {
  const { teach } = await fixture();
  const briefPath = path.join(teach, "publications", "queue-public.yaml");
  await writeFile(briefPath, (await readFile(briefPath, "utf8")).replace("schema_version: 2", "schema_version: 1"));
  const result = await runCli(["generate", "--intent", "wechat", "--brief", "queue-public", "--json"], teach);
  assert.equal(result.exitCode, 2);
  assert.equal(result.stderr, "");
  assert.equal(JSON.parse(result.stdout).error.code, "migration-required");
});
