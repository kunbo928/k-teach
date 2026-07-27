import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { KTeachError } from "./errors.js";

const DEFAULT_CONFIG = `schema_version: 1
design_profile: field-manual
output_dir: .k-teach/output
visuals: auto
`;

const WORKSPACE_DOCUMENTS                                   = {
  "MISSION.md": `# Mission: <topic>

## Why
Describe the concrete real-world outcome.

## Success looks like
- Add an observable capability.

## Constraints
- Add time, tools, or learning constraints.

## Out of scope
- Add adjacent topics deliberately deferred.
`,
  "RESOURCES.md": `# Learning resources

## Knowledge

## Wisdom

## Gaps
`,
  "GLOSSARY.md": `# Learning glossary

## Terms
`,
  "NOTES.md": `# Learning notes

Record stable teaching preferences and useful working context here.
`,
};

export async function initializeWorkspace(root        )                {
  const configPath = path.join(root, "k-teach.yaml");

  try {
    await writeFile(configPath, DEFAULT_CONFIG, {
      encoding: "utf8",
      flag: "wx",
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EEXIST"
    ) {
      throw new KTeachError(
        "invalid-workspace",
        "k-teach.yaml already exists; initialization stopped.",
        "Run validate, or choose an empty directory.",
        { path: configPath },
      );
    }
    throw error;
  }

  await Promise.all(
    [
      "lessons",
      "publications",
      "learning-records",
      "reference",
      "media",
      ".k-teach/artifacts",
      ".k-teach/attempts",
    ].map((directory) => mkdir(path.join(root, directory), { recursive: true })),
  );
  await Promise.all(
    Object.entries(WORKSPACE_DOCUMENTS).map(([file, content]) =>
      writeFile(path.join(root, file), content, {
        encoding: "utf8",
        flag: "wx",
      }),
    ),
  );
}

async function exists(filePath        )                   {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function assertWorkspaceIsCurrent(root        )                {
  if (await exists(path.join(root, "k-teach.yaml"))) return;
  const lessonsPath = path.join(root, "lessons");
  const lessonFiles = await readdir(lessonsPath).catch(() => []);
  const legacyMarkers =
    (await exists(path.join(root, "MISSION.md"))) &&
    lessonFiles.some((file) => file.endsWith(".html"));
  if (legacyMarkers) {
    throw new KTeachError(
      "invalid-workspace",
      "legacy Learning Workspace detected.",
      "Run k-teach migrate --dry-run to review the proposed Lesson Bundle migration.",
      { format: "learn-with-taste", lesson_count: lessonFiles.length },
    );
  }
}

export async function previewLegacyMigration(root        )                    {
  const lessonsPath = path.join(root, "lessons");
  const lessonFiles = (await readdir(lessonsPath).catch(() => []))
    .filter((file) => file.endsWith(".html"))
    .sort();
  if (
    !(await exists(path.join(root, "MISSION.md"))) ||
    lessonFiles.length === 0
  ) {
    throw new KTeachError(
      "invalid-workspace",
      "No legacy Learning Workspace was detected.",
      "Run this command from a learn-with-taste workspace.",
    );
  }
  return lessonFiles.map((file) => {
    const slug = file.slice(0, -".html".length);
    return `lessons/${file} -> lessons/${slug}/lesson.yaml + lesson.md + exercises/ + media/`;
  });
}


//# sourceURL=k-teach/src/workspace.ts