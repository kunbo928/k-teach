import assert from "node:assert/strict";
import { access, mkdtemp, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { stageAndPromoteArtifact } from "../dist/artifact-pipeline.js";

test("validated staging atomically replaces an artifact", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "k-teach-artifact-"));
  const final = path.join(root, "output", "web");
  await mkdir(final, { recursive: true });
  await writeFile(path.join(final, "index.html"), "old");
  const promoted = await stageAndPromoteArtifact({
    root, outputDirectory: "output", relativeArtifact: "web",
    render: async (stagingOutput) => { const output = path.join(stagingOutput, "web"); await mkdir(output, { recursive: true }); await writeFile(path.join(output, "index.html"), "new"); return output; },
    validate: async (output) => assert.equal(await readFile(path.join(output, "index.html"), "utf8"), "new"),
  });
  assert.equal(promoted, final);
  assert.equal(await readFile(path.join(final, "index.html"), "utf8"), "new");
});

test("failed validation preserves the last good artifact and removes staging", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "k-teach-artifact-"));
  const final = path.join(root, "output", "wechat", "brief");
  await mkdir(final, { recursive: true });
  await writeFile(path.join(final, "article.html"), "good");
  await assert.rejects(stageAndPromoteArtifact({
    root, outputDirectory: "output", relativeArtifact: "wechat/brief",
    render: async (stagingOutput) => { const output = path.join(stagingOutput, "wechat", "brief"); await mkdir(output, { recursive: true }); await writeFile(path.join(output, "article.html"), "partial"); return output; },
    validate: async () => { throw new Error("invalid artifact"); },
  }));
  assert.equal(await readFile(path.join(final, "article.html"), "utf8"), "good");
  await access(path.join(root, ".k-teach", "staging"));
  assert.equal((await stat(path.join(root, ".k-teach", "staging"))).isDirectory(), true);
});

test("publication-frozen artifacts are never mutated", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "k-teach-artifact-"));
  const final = path.join(root, "output", "wechat", "brief");
  await mkdir(final, { recursive: true });
  await writeFile(path.join(final, ".publication-frozen"), "attempt-a");
  await assert.rejects(stageAndPromoteArtifact({ root, outputDirectory: "output", relativeArtifact: "wechat/brief", render: async () => "never", validate: async () => undefined }), /frozen/i);
});

test("concurrent promotion for one destination cannot expose a partial artifact", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "k-teach-artifact-"));
  let release;
  let started;
  const startedPromise = new Promise((resolve) => { started = resolve; });
  const releasePromise = new Promise((resolve) => { release = resolve; });
  const first = stageAndPromoteArtifact({
    root, outputDirectory: "output", relativeArtifact: "web",
    render: async (staging) => { started(); await releasePromise; const output = path.join(staging, "web"); await mkdir(output, { recursive: true }); await writeFile(path.join(output, "index.html"), "complete"); return output; },
    validate: async () => undefined,
  });
  await startedPromise;
  await assert.rejects(stageAndPromoteArtifact({ root, outputDirectory: "output", relativeArtifact: "web", render: async () => "never", validate: async () => undefined }), /already in progress/);
  release();
  await first;
  assert.equal(await readFile(path.join(root, "output", "web", "index.html"), "utf8"), "complete");
});
