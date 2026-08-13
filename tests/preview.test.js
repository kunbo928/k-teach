import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { renderWeb } from "../src/web-renderer.ts";
import { startPreviewRuntime } from "../src/preview-runtime.ts";

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
  const preview = await startPreviewRuntime({
    projectRoot: workspace,
    teaches: [{ id: "main", title: "Main", root: output }],
    host: "127.0.0.1",
    port: 0,
  });
  t.after(() => preview.close());

  const health = await fetch(new URL("__k_teach/health", preview.url));
  assert.equal(health.status, 200);
  assert.equal((await health.json()).service, "k-teach-preview");
  const index = await fetch(new URL("teachs/main/", preview.url));
  assert.equal(index.status, 200);
  assert.match(await index.text(), /你的学习手册/);

  const traversal = await fetch(new URL("teachs/main/..%2F..%2FMISSION.md", preview.url));
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
  await mkdir(path.join(project, ".k-teach"), { recursive: true });
  await Promise.all([
    writeFile(
      path.join(project, ".k-teach", "config.yaml"),
      "schema_version: 1\ndesign_profile: field-manual\noutput_dir: main\nvisuals: auto\n",
    ),
    writeFile(
      path.join(project, "teachs", "alpha", "teach.yaml"),
      "schema_version: 1\nid: alpha\ntitle: Alpha Teach\n",
    ),
    writeFile(
      path.join(project, "teachs", "beta", "teach.yaml"),
      "schema_version: 1\nid: beta\ntitle: Beta Teach\n",
    ),
  ]);
  await mkdir(path.join(project, "main", "ppt", "deck"), { recursive: true });
  await mkdir(path.join(project, "main", "wechat", "article"), { recursive: true });
  await Promise.all([
    writeFile(path.join(project, "main", "ppt", "deck", "index.html"), "<!doctype html><title>Deck route</title>"),
    writeFile(path.join(project, "main", "wechat", "article", "preview.html"), "<!doctype html><title>Article preview</title>"),
    writeFile(path.join(project, "main", "wechat", "article", "proposals.html"), "<!doctype html><title>Article proposals</title>"),
  ]);

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
  assert.match(await (await fetch(new URL("ppt/deck/", url))).text(), /Deck route/);
  assert.match(await (await fetch(new URL("wechat/article/", url))).text(), /Article proposals/);
  const alpha = await fetch(new URL("teachs/alpha/", url));
  const betaLesson = await fetch(
    new URL("teachs/beta/lessons/why-event-loop.html", url),
  );
  assert.equal(alpha.status, 200);
  assert.equal(betaLesson.status, 200);
});

test("preview exits diagnostically when its temporary project root disappears", async () => {
  const project = await mkdtemp(path.join(tmpdir(), "k-teach-preview-root-"));
  const output = path.join(project, "output");
  await mkdir(output);
  await writeFile(path.join(output, "index.html"), "<!doctype html><title>ok</title>");
  const preview = await startPreviewRuntime({
    projectRoot: project,
    teaches: [{ id: "main", title: "Main", root: output }],
    host: "127.0.0.1",
    port: 0,
    cacheDir: path.join(tmpdir(), "k-teach-preview-test-cache"),
  });
  await rm(project, { recursive: true });
  assert.equal(await Promise.race([
    preview.closed,
    new Promise((_, reject) => setTimeout(() => reject(new Error("preview did not stop")), 3000)),
  ]), "project-missing");
});

test("preview watches authoritative inputs and keeps the last good artifact on render failure", async (t) => {
  const project = await mkdtemp(path.join(tmpdir(), "k-teach-preview-watch-"));
  const output = path.join(project, ".k-teach", "output", "web");
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "index.html"), "<!doctype html><body>last good</body>");
  const preview = await startPreviewRuntime({
    projectRoot: project,
    teaches: [{ id: "main", title: "Main", root: output, artifactRoot: path.dirname(output) }],
    host: "127.0.0.1",
    port: 0,
    cacheDir: path.join(tmpdir(), "k-teach-preview-watch-cache"),
    onInputChange: async () => { throw new Error("invalid lesson fixture"); },
  });
  t.after(() => preview.close());
  const initial = await (await fetch(new URL("teachs/main/", preview.url))).text();
  assert.match(initial, /last good/);
  assert.match(initial, /data-k-teach-preview-client/);
  await writeFile(path.join(project, "lesson-input.md"), "invalid change");
  let health;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    health = await (await fetch(new URL("__k_teach/health", preview.url))).json();
    if (health.last_error) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.match(health.last_error, /invalid lesson fixture/);
  assert.match(await (await fetch(new URL("teachs/main/", preview.url))).text(), /last good/);
});

test("preview reuses the same project and avoids other K Teach or non-K-Teach port owners", async (t) => {
  const makeProject = async (prefix) => {
    const root = await mkdtemp(path.join(tmpdir(), prefix));
    const output = path.join(root, "output");
    await mkdir(output);
    await writeFile(path.join(output, "index.html"), "<!doctype html><body>ok</body>");
    return { root, output };
  };
  const firstProject = await makeProject("k-teach-reuse-a-");
  const secondProject = await makeProject("k-teach-reuse-b-");
  const first = await startPreviewRuntime({ projectRoot: firstProject.root, teaches: [{ id: "a", title: "A", root: firstProject.output }], host: "127.0.0.1", port: 0 });
  t.after(() => first.close());
  const reused = await startPreviewRuntime({ projectRoot: firstProject.root, teaches: [{ id: "a", title: "A", root: firstProject.output }], host: "127.0.0.1", port: first.port });
  assert.equal(reused.reused, true);
  assert.equal(reused.port, first.port);
  const other = await startPreviewRuntime({ projectRoot: secondProject.root, teaches: [{ id: "b", title: "B", root: secondProject.output }], host: "127.0.0.1", port: first.port });
  t.after(() => other.close());
  assert.notEqual(other.port, first.port);
  assert.ok(other.notices.some((notice) => notice.includes("another healthy K Teach project")));

  const foreign = createServer((_request, response) => response.end("foreign"));
  await new Promise((resolve) => foreign.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => foreign.close(resolve)));
  const address = foreign.address();
  assert.ok(address && typeof address !== "string");
  const thirdProject = await makeProject("k-teach-reuse-c-");
  const avoided = await startPreviewRuntime({ projectRoot: thirdProject.root, teaches: [{ id: "c", title: "C", root: thirdProject.output }], host: "127.0.0.1", port: address.port });
  t.after(() => avoided.close());
  assert.notEqual(avoided.port, address.port);
  assert.ok(avoided.notices.some((notice) => notice.includes("non-K-Teach service")));
});
