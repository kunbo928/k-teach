import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { KTeachError } from "./errors.ts";

const DEFAULT_CONFIG = `schema_version: 1
design_profile: field-manual
output_dir: .k-teach/output
visuals: auto
`;

const WORKSPACE_DOCUMENTS: Readonly<Record<string, string>> = {
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

export async function initializeWorkspace(root: string): Promise<void> {
  const workspaceRoot = path.join(root, "k-teach");
  await mkdir(workspaceRoot, { recursive: true });
  const configPath = path.join(workspaceRoot, "config.yaml");

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
      // User-owned configuration is preserved on repeated init.
    } else {
      throw error;
    }
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
    ].map((directory) =>
      mkdir(path.join(workspaceRoot, directory), { recursive: true }),
    ),
  );
  await Promise.all(
    Object.entries(WORKSPACE_DOCUMENTS).map(async ([file, content]) => {
      try {
        await writeFile(path.join(workspaceRoot, file), content, {
          encoding: "utf8",
          flag: "wx",
        });
      } catch (error) {
        if (
          !error ||
          typeof error !== "object" ||
          !("code" in error) ||
          error.code !== "EEXIST"
        ) {
          throw error;
        }
      }
    }),
  );
}

export async function resolveWorkspaceRoot(projectRoot: string): Promise<string> {
  const nested = path.join(projectRoot, "k-teach");
  if (await exists(path.join(nested, "config.yaml"))) return nested;
  return nested;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function assertWorkspaceIsCurrent(root: string): Promise<void> {
  if (await exists(path.join(root, "config.yaml"))) return;
  const projectRoot = path.dirname(root);
  if (await exists(path.join(projectRoot, "k-teach.yaml"))) {
    throw new KTeachError(
      "invalid-workspace",
      "unsupported root-level K Teach workspace detected.",
      "Choose a new project directory and run k-teach init.",
    );
  }
  const lessonsPath = path.join(projectRoot, "lessons");
  const lessonFiles = await readdir(lessonsPath).catch(() => []);
  const legacyMarkers =
    (await exists(path.join(projectRoot, "MISSION.md"))) &&
    lessonFiles.some((file) => file.endsWith(".html"));
  if (legacyMarkers) {
    throw new KTeachError(
      "invalid-workspace",
      "unsupported legacy Learning Workspace detected.",
      "Choose a new project directory and run k-teach init.",
      { format: "learn-with-taste", lesson_count: lessonFiles.length },
    );
  }
  throw new KTeachError(
    "invalid-workspace",
    "K Teach Learning Workspace not found.",
    "Run k-teach init --tools <tools>.",
  );
}

export async function previewLegacyMigration(root: string): Promise<string[]> {
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
