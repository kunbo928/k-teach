import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  promoteRouteArtifact,
  runGenerationRoute,
} from "../dist/generation-route.js";

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

async function scaffoldTeach(root) {
  assert.equal((await runCli(["init", "--tools", "none"], root)).exitCode, 0);
  const teach = path.join(root, "teachs", "main");
  const lesson = path.join(teach, "lessons", "0001-demo");
  await mkdir(path.join(lesson, "exercises"), { recursive: true });
  await mkdir(path.join(lesson, "media"), { recursive: true });
  await writeFile(
    path.join(lesson, "lesson.yaml"),
    `schema_version: 1
id: demo
revision: r1
title: Demo
mission: Learn
objectives:
  - One
sources: []
composition: reading
visuals: off
`,
  );
  await writeFile(
    path.join(lesson, "lesson.md"),
    `# Demo

## Body

Hello.
`,
  );
  return teach;
}

test("runGenerationRoute is the ordinary Generation Run entry", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "k-teach-route-"));
  const teach = await scaffoldTeach(root);
  const missing = await runGenerationRoute({
    root: teach,
    intent: "learn",
    version: "test",
    outputDirectory: ".k-teach/output",
  });
  assert.equal(missing.state, "needs_input");
  assert.deepEqual(missing.next_action.fields, ["lesson"]);

  const complete = await runGenerationRoute({
    root: teach,
    intent: "learn",
    lessonId: "demo",
    version: "test",
    outputDirectory: ".k-teach/output",
  });
  assert.equal(complete.state, "complete");
  assert.ok(complete.refs.artifact);
  await access(path.join(teach, ".k-teach", "output", "web", "artifact-manifest.json"));
});

test("project config keeps route artifacts in the nearest user-facing main directory", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "k-teach-output-owner-"));
  const teach = await scaffoldTeach(project);
  const generated = await runCli(
    ["generate", "--intent", "learn", "--lesson", "demo", "--json"],
    project,
  );

  assert.equal(generated.exitCode, 0, generated.stderr);
  await access(path.join(project, "main", "web", "artifact-manifest.json"));
  await assert.rejects(
    access(path.join(teach, ".k-teach", "output", "web")),
    { code: "ENOENT" },
  );
});

test("promoteRouteArtifact stages and promotes diagnostic web renders", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "k-teach-promote-"));
  const teach = await scaffoldTeach(root);
  const output = await promoteRouteArtifact({
    root: teach,
    outputDirectory: ".k-teach/output",
    intent: "learn",
  });
  assert.equal(output, path.join(teach, ".k-teach", "output", "web"));
  const manifest = JSON.parse(
    await readFile(path.join(output, "artifact-manifest.json"), "utf8"),
  );
  assert.equal(manifest.channel, "web");
  assert.ok(Array.isArray(manifest.files));
});
