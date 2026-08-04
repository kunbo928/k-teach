import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { readContentCache, writeContentCache } from "../dist/content-cache.js";

test("content cache verifies input, version, schema, and payload hash", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "k-teach-cache-"));
  const input = "a".repeat(64);
  await writeContentCache(root, "context", input, "v1", ["ctx-a"], { packet_id: "ctx-a" });
  assert.deepEqual(await readContentCache(root, "context", input, "v1"), { packet_id: "ctx-a" });
  assert.equal(await readContentCache(root, "context", input, "v2"), undefined);
  await writeFile(path.join(root, ".k-teach", "cache", "context", `${input}.payload.json`), "{}\n");
  assert.equal(await readContentCache(root, "context", input, "v1"), undefined);
});
