import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { validateDocument } from "./schema.js";



function outputHash(serialized        )         {
  return createHash("sha256").update(serialized).digest("hex");
}

function paths(root        , kind           , inputHash        ) {
  const directory = path.join(root, ".k-teach", "cache", kind);
  return {
    directory,
    record: path.join(directory, `${inputHash}.record.json`),
    payload: path.join(directory, `${inputHash}.payload.json`),
  };
}

export async function writeContentCache(root        , kind           , inputHash        , version        , refs          , payload         )                {
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

export async function readContentCache             (root        , kind           , inputHash        , version        )                         {
  try {
    const target = paths(root, kind, inputHash);
    const record = JSON.parse(await readFile(target.record, "utf8"))                                              ;
    if ((await validateDocument("cache-record", record)).length || record.version !== version) return undefined;
    const serialized = await readFile(target.payload, "utf8");
    if (record.output_hash !== outputHash(serialized)) return undefined;
    return JSON.parse(serialized)     ;
  } catch {
    return undefined;
  }
}


//# sourceURL=k-teach/src/content-cache.ts