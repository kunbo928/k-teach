import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { renderWeb } from "../src/web-renderer.ts";
import { startPreviewServer } from "../src/preview-server.ts";

const cliPath = path.resolve("bin/k-teach.js");

test("preview serves the rendered local course without directory traversal", async (t) => {
  const workspace = await mkdtemp(path.join(tmpdir(), "k-teach-preview-"));
  await cp(path.resolve("tests/fixtures/web-course"), workspace, {
    recursive: true,
  });
  const output = await renderWeb(workspace, ".k-teach/output");
  for (const [id, mode] of [
    ["why-event-loop", "reading"],
    ["predict-queue-order", "workshop"],
    ["map-event-loop-phases", "atlas"],
  ]) {
    const page = await readFile(path.join(output, "lessons", `${id}.html`), "utf8");
    assert.match(page, new RegExp(`class="lesson mode-${mode}"`));
    assert.equal((page.match(/<h1/g) ?? []).length, 1);
  }
  const preview = await startPreviewServer(output, {
    host: "127.0.0.1",
    port: 0,
  });
  t.after(() => preview.close());

  const index = await fetch(preview.url);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /你的学习手册/);

  const traversal = await fetch(`${preview.url}..%2F..%2FMISSION.md`);
  assert.equal(traversal.status, 404);
});

test("project preview serves every Teach from one process", async (t) => {
  const project = await mkdtemp(path.join(tmpdir(), "k-teach-project-preview-"));
  await cp(path.resolve("tests/fixtures/web-course"), path.join(project, "teachs", "alpha"), {
    recursive: true,
  });
  await cp(path.resolve("tests/fixtures/web-course"), path.join(project, "teachs", "beta"), {
    recursive: true,
  });
  await import("node:fs/promises").then(({ mkdir, writeFile }) =>
    Promise.all([
      mkdir(path.join(project, ".k-teach"), { recursive: true }),
      writeFile(
        path.join(project, ".k-teach", "config.yaml"),
        "schema_version: 1\ndesign_profile: field-manual\noutput_dir: .k-teach/output\nvisuals: auto\n",
      ),
      writeFile(
        path.join(project, "teachs", "alpha", "teach.yaml"),
        "schema_version: 1\nid: alpha\ntitle: Alpha Teach\n",
      ),
      writeFile(
        path.join(project, "teachs", "beta", "teach.yaml"),
        "schema_version: 1\nid: beta\ntitle: Beta Teach\n",
      ),
    ]),
  );

  const child = spawn(process.execPath, [cliPath, "preview", "--port", "0"], {
    cwd: project,
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    if (!child.killed) child.kill("SIGTERM");
  });

  const url = await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(
      () => reject(new Error(`Preview did not start.\n${stdout}\n${stderr}`)),
      5000,
    );
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const match = stdout.match(/Preview available at (http:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Preview exited with ${code}.\n${stdout}\n${stderr}`));
    });
  });

  const index = await fetch(url);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /Alpha Teach/);
  const alpha = await fetch(new URL("teachs/alpha/", url));
  const betaLesson = await fetch(
    new URL("teachs/beta/lessons/why-event-loop.html", url),
  );
  assert.equal(alpha.status, 200);
  assert.equal(betaLesson.status, 200);
});
