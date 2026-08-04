import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { validateDocument } from "./schema.ts";

type CacheKind = "context" | "plan" | "media" | "artifact" | "generation-run";

function outputHash(serialized: string): string {
  return createHash("sha256").update(serialized).digest("hex");
}

function paths(root: string, kind: CacheKind, inputHash: string) {
  const directory = path.join(root, ".k-teach", "cache", kind);
  return {
    directory,
    record: path.join(directory, `${inputHash}.record.json`),
    payload: path.join(directory, `${inputHash}.payload.json`),
  };
}

export async function writeContentCache(root: string, kind: CacheKind, inputHash: string, version: string, refs: string[], payload: unknown): Promise<void> {
  const target = paths(root, kind, inputHash);
  await mkdir(target.directory, { recursive: true });
  const serialized = `${JSON.stringify(payload)}\n`;
  const record = { schema_version: 1, kind, input_hash: inputHash, output_hash: outputHash(serialized), version, refs };
  const suffix = randomUUID();
  const temporaryPayload = `${target.payload}.${suffix}.tmp`;
  const temporaryRecord = `${target.record}.${suffix}.tmp`;
  await writeFile(temporaryPayload, serialized);
  await writeFile(temporaryRecord, `${JSON.stringify(record)}\n`);
  await rename(temporaryPayload, target.payload);
  await rename(temporaryRecord, target.record);
}

export async function readContentCache<T = unknown>(root: string, kind: CacheKind, inputHash: string, version: string): Promise<T | undefined> {
  try {
    const target = paths(root, kind, inputHash);
    const record = JSON.parse(await readFile(target.record, "utf8")) as { version?: string; output_hash?: string };
    if ((await validateDocument("cache-record", record)).length || record.version !== version) return undefined;
    const serialized = await readFile(target.payload, "utf8");
    if (record.output_hash !== outputHash(serialized)) return undefined;
    return JSON.parse(serialized) as T;
  } catch {
    return undefined;
  }
}
