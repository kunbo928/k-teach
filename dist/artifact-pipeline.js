import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";

import { KTeachError } from "./errors.js";









async function exists(file        )                   {
  try { await access(file); return true; } catch { return false; }
}

export async function stageAndPromoteArtifact(options                       )                  {
  if (path.isAbsolute(options.relativeArtifact) || options.relativeArtifact.split(path.sep).includes("..")) {
    throw new KTeachError("validation-failed", "Artifact path must stay inside the configured output directory.", "Use a channel-relative artifact path.");
  }
  const outputRoot = path.resolve(options.root, options.outputDirectory);
  const finalArtifact = path.join(outputRoot, options.relativeArtifact);
  const locksRoot = path.join(options.root, ".k-teach", "locks");
  const lock = path.join(locksRoot, `${createHash("sha256").update(finalArtifact).digest("hex").slice(0, 24)}.lock`);
  await mkdir(locksRoot, { recursive: true });
  try { await mkdir(lock); }
  catch { throw new KTeachError("render-failed", "An artifact generation for this destination is already in progress.", "Wait for the current Generation Run to finish and retry."); }
  try {
  if (await exists(path.join(finalArtifact, ".publication-frozen"))) {
    throw new KTeachError("render-failed", "The destination artifact is publication-frozen.", "Create a new Brief revision and artifact identity.");
  }
  const stagingRoot = path.join(options.root, ".k-teach", "staging");
  const stage = path.join(stagingRoot, randomUUID());
  const stagingOutput = path.join(stage, "output");
  const backup = path.join(stagingRoot, `${randomUUID()}.backup`);
  await mkdir(stagingOutput, { recursive: true });
  let backedUp = false;
  try {
    const rendered = await options.render(stagingOutput);
    const expected = path.join(stagingOutput, options.relativeArtifact);
    if (path.resolve(rendered) !== path.resolve(expected)) {
      throw new KTeachError("render-failed", "Renderer returned an unexpected staged artifact path.", "Keep route output within its staged channel path.");
    }
    await options.validate(rendered);
    await mkdir(path.dirname(finalArtifact), { recursive: true });
    if (await exists(finalArtifact)) {
      await rename(finalArtifact, backup);
      backedUp = true;
    }
    try {
      await rename(rendered, finalArtifact);
    } catch (error) {
      if (backedUp) await rename(backup, finalArtifact).catch(() => undefined);
      throw error;
    }
    if (backedUp) await rm(backup, { recursive: true, force: true });
    return finalArtifact;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
  } finally {
    await rm(lock, { recursive: true, force: true });
  }
}


//# sourceURL=k-teach/src/artifact-pipeline.ts