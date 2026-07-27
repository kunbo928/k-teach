import assert from "node:assert/strict";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { renderWeb } from "../src/web-renderer.ts";
import { startPreviewServer } from "../src/preview-server.ts";

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
