import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";


import { KTeachError } from "./errors.js";
import { validateDocument } from "./schema.js";




























const ASSET_MARKER = /\{\{asset:([A-Za-z0-9][A-Za-z0-9_-]*)\}\}/g;

function markerIds(markdown        )           {
  return [...markdown.matchAll(ASSET_MARKER)].map((match) => match[1]);
}

export async function resolveEmbeddedAssets(
  lessonDirectory        ,
  lesson              ,
  markdown        ,
)                                   {
  const documentPath = path.join(lessonDirectory, "media", "assets.yaml");
  let source        ;
  try {
    source = await readFile(documentPath, "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      const markers = markerIds(markdown);
      if (markers.length > 0) {
        throw new KTeachError(
          "invalid-bundle",
          `${lesson.id}: asset markers exist but media/assets.yaml is missing.`,
          "Declare every Embedded Learning Asset in media/assets.yaml.",
          { asset_ids: markers },
        );
      }
      return {
        assets: new Map(),
        inputFingerprint: "embedded-assets:none",
      };
    }
    throw error;
  }

  let value         ;
  try {
    value = parse(source);
  } catch {
    throw new KTeachError(
      "invalid-bundle",
      `${lesson.id}: media/assets.yaml is not valid YAML.`,
      "Correct the Embedded Learning Asset document and validate again.",
    );
  }
  const errors = await validateDocument("embedded-assets", value);
  if (errors.length > 0) {
    throw new KTeachError(
      "invalid-bundle",
      `${lesson.id}/media/assets.yaml: ${errors.join("; ")}.`,
      "Correct the Embedded Learning Asset document and validate again.",
      { errors },
    );
  }
  const document = value                          ;
  if (
    document.lesson_id !== lesson.id ||
    document.lesson_revision !== lesson.revision
  ) {
    throw new KTeachError(
      "invalid-bundle",
      `${lesson.id}: media/assets.yaml does not match the Lesson Bundle revision.`,
      "Update the asset document from the current lesson revision.",
    );
  }

  const assets = new Map                       ();
  const fingerprints = [source];
  const canonicalMediaRoot = await realpath(
    path.join(lessonDirectory, "media"),
  );
  for (const asset of document.assets) {
    if (assets.has(asset.id)) {
      throw new KTeachError(
        "invalid-bundle",
        `${lesson.id}: duplicate Embedded Learning Asset id ${asset.id}.`,
        "Give every embedded asset a unique id.",
      );
    }
    if (
      !asset.source.startsWith("media/") ||
      path.posix.normalize(asset.source) !== asset.source
    ) {
      throw new KTeachError(
        "invalid-bundle",
        `${lesson.id}: asset ${asset.id} must use a normalized media/ path.`,
        "Move the source into the lesson media directory.",
      );
    }
    if (asset.kind === "audio" && !asset.transcript) {
      throw new KTeachError(
        "invalid-bundle",
        `${lesson.id}: audio asset ${asset.id} is missing a transcript.`,
        "Add an equivalent transcript so the lesson remains accessible without audio.",
      );
    }
    const assetPath = path.join(lessonDirectory, ...asset.source.split("/"));
    const canonicalAssetPath = await realpath(assetPath).catch(() => assetPath);
    const relative = path.relative(canonicalMediaRoot, canonicalAssetPath);
    if (
      path.isAbsolute(relative) ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`)
    ) {
      throw new KTeachError(
        "invalid-bundle",
        `${lesson.id}: asset ${asset.id} points outside the lesson media directory.`,
        "Use a local file below media/.",
      );
    }
    let bytes        ;
    try {
      bytes = await readFile(canonicalAssetPath);
    } catch {
      throw new KTeachError(
        "invalid-bundle",
        `${lesson.id}: asset ${asset.id} source is not readable.`,
        "Restore the declared local media file.",
        { source: asset.source },
      );
    }
    fingerprints.push(
      createHash("sha256").update(asset.source).update(bytes).digest("hex"),
    );
    assets.set(asset.id, asset);
  }

  const markers = markerIds(markdown);
  for (const id of markers) {
    if (!assets.has(id)) {
      throw new KTeachError(
        "invalid-bundle",
        `${lesson.id}: asset marker ${id} has no declaration.`,
        "Add the asset to media/assets.yaml or remove the marker.",
      );
    }
  }
  const unused = [...assets.keys()].filter((id) => !markers.includes(id));
  if (unused.length > 0) {
    throw new KTeachError(
      "invalid-bundle",
      `${lesson.id}: declared assets are not placed in lesson.md: ${unused.join(", ")}.`,
      "Place each asset with {{asset:<id>}} at its teaching location.",
    );
  }
  return {
    assets,
    inputFingerprint: createHash("sha256")
      .update(fingerprints.join(":"))
      .digest("hex"),
  };
}


//# sourceURL=k-teach/src/embedded-assets.ts