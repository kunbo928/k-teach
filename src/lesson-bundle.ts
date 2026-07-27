import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { KTeachError } from "./errors.ts";
import { validateDocument } from "./schema.ts";

async function requirePath(filePath: string, lessonId: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    throw new KTeachError(
      "invalid-bundle",
      `${lessonId} is missing ${path.basename(filePath)}.`,
      "Restore the required Lesson Bundle path and run validate again.",
      { lesson: lessonId, path: filePath },
    );
  }
}

export async function validateLessonBundles(root: string): Promise<number> {
  const lessonsRoot = path.join(root, "lessons");
  const entries = await readdir(lessonsRoot, { withFileTypes: true }).catch(
    () => [],
  );
  const bundles = entries.filter((entry) => entry.isDirectory());

  for (const entry of bundles) {
    const bundleRoot = path.join(lessonsRoot, entry.name);
    const metadataPath = path.join(bundleRoot, "lesson.yaml");
    await requirePath(metadataPath, entry.name);
    await requirePath(path.join(bundleRoot, "lesson.md"), entry.name);
    await requirePath(path.join(bundleRoot, "exercises"), entry.name);
    await requirePath(path.join(bundleRoot, "media"), entry.name);

    let metadata: unknown;
    try {
      metadata = parse(await readFile(metadataPath, "utf8"));
    } catch {
      throw new KTeachError(
        "invalid-bundle",
        `${entry.name}/lesson.yaml is not valid YAML.`,
        "Correct the YAML syntax and run validate again.",
        { lesson: entry.name },
      );
    }
    const errors = await validateDocument("lesson-bundle", metadata);
    if (errors.length > 0) {
      throw new KTeachError(
        "invalid-bundle",
        `${entry.name}/lesson.yaml: ${errors.join("; ")}.`,
        "Correct the Lesson Bundle metadata and run validate again.",
        { lesson: entry.name, errors },
      );
    }
  }
  return bundles.length;
}
