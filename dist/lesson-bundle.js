import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { KTeachError } from "./errors.js";
import { resolveEmbeddedAssets } from "./embedded-assets.js";
import { validateDocument } from "./schema.js";









async function requirePath(filePath        , lessonId        )                {
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

export async function readExercises(
  directory        ,
  lessonId        ,
)                      {
  const entries = await readdir(directory, { withFileTypes: true });
  const unsupported = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.name.startsWith(".") &&
        !entry.name.endsWith(".yaml") &&
        !entry.name.endsWith(".yml"),
    )
    .map((entry) => entry.name)
    .sort();
  if (unsupported.length > 0) {
    throw new KTeachError(
      "invalid-bundle",
      `${lessonId}/exercises contains unsupported files: ${unsupported.join(", ")}.`,
      "Convert each exercise to the exercise YAML contract; Markdown exercise files are not rendered.",
      { lesson: lessonId, files: unsupported },
    );
  }

  const files = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")),
    )
    .map((entry) => entry.name)
    .sort();
  const exercises             = [];
  for (const file of files) {
    let value         ;
    try {
      value = parse(await readFile(path.join(directory, file), "utf8"));
    } catch {
      throw new KTeachError(
        "invalid-bundle",
        `${lessonId}/exercises/${file} is not valid YAML.`,
        "Correct the exercise YAML syntax and run validate again.",
        { lesson: lessonId, file },
      );
    }
    const errors = await validateDocument("exercise", value);
    if (errors.length > 0) {
      throw new KTeachError(
        "invalid-bundle",
        `${lessonId}/exercises/${file}: ${errors.join("; ")}.`,
        "Correct the exercise and run validate again.",
        { lesson: lessonId, file, errors },
      );
    }
    exercises.push(value            );
  }
  return exercises;
}

export function validateExercisePlacements(
  exercises            ,
  markdown        ,
  lessonId        ,
)       {
  const byId = new Map                  ();
  for (const exercise of exercises) {
    if (byId.has(exercise.id)) {
      throw new KTeachError(
        "invalid-bundle",
        `${lessonId}: duplicate exercise id ${exercise.id}.`,
        "Give every exercise a unique id.",
      );
    }
    byId.set(exercise.id, exercise);
  }
  const markers = [
    ...markdown.matchAll(
      /\{\{exercise:([A-Za-z0-9][A-Za-z0-9_-]*)\}\}/g,
    ),
  ].map((match) => match[1]);
  for (const id of markers) {
    if (!byId.has(id)) {
      throw new KTeachError(
        "invalid-bundle",
        `${lessonId}: exercise marker ${id} has no exercise YAML.`,
        "Create the exercise YAML or remove the marker.",
      );
    }
    if (markers.filter((marker) => marker === id).length > 1) {
      throw new KTeachError(
        "invalid-bundle",
        `${lessonId}: exercise ${id} is placed more than once.`,
        "Keep exactly one {{exercise:<id>}} marker.",
      );
    }
  }
  const unplaced = [...byId.keys()].filter((id) => !markers.includes(id));
  if (unplaced.length > 0) {
    throw new KTeachError(
      "invalid-bundle",
      `${lessonId}: exercises are not placed in lesson.md: ${unplaced.join(", ")}.`,
      "Place each exercise with {{exercise:<id>}} at the point of practice.",
    );
  }
}

export async function validateLessonBundles(root        )                  {
  const lessonsRoot = path.join(root, "lessons");
  const entries = await readdir(lessonsRoot, { withFileTypes: true }).catch(
    () => [],
  );
  const bundles = entries.filter((entry) => entry.isDirectory());

  for (const entry of bundles) {
    const bundleRoot = path.join(lessonsRoot, entry.name);
    const metadataPath = path.join(bundleRoot, "lesson.yaml");
    await requirePath(metadataPath, entry.name);
    const lessonPath = path.join(bundleRoot, "lesson.md");
    await requirePath(lessonPath, entry.name);
    const exercisesPath = path.join(bundleRoot, "exercises");
    await requirePath(exercisesPath, entry.name);
    await requirePath(path.join(bundleRoot, "media"), entry.name);

    let metadata         ;
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
    const markdown = await readFile(lessonPath, "utf8");
    const exercises = await readExercises(exercisesPath, entry.name);
    validateExercisePlacements(exercises, markdown, entry.name);
    await resolveEmbeddedAssets(
      bundleRoot,
      metadata                                      ,
      markdown,
    );
  }
  return bundles.length;
}


//# sourceURL=k-teach/src/lesson-bundle.ts