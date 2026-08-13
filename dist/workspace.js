import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";

import { KTeachError } from "./errors.js";

function defaultConfig(wechatAccount         )         {
  return `schema_version: 1
design_profile: field-manual
output_dir: main
visuals: auto
${wechatAccount ? `wechat_account: ${wechatAccount}\n` : ""}`;
}

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

const TEACH_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;







export async function listTeaches(projectRoot        )                          {
  const collectionRoot = path.join(projectRoot, "teachs");
  const entries = await readdir(collectionRoot, { withFileTypes: true });
  const teaches = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const root = path.join(collectionRoot, entry.name);
        try {
          const document = parse(await readFile(path.join(root, "teach.yaml"), "utf8"));
          if (
            !document ||
            typeof document !== "object" ||
            document.id !== entry.name ||
            typeof document.title !== "string"
          ) {
            return undefined;
          }
          return { id: entry.name, title: document.title, root };
        } catch {
          return undefined;
        }
      }),
  );
  return teaches
    .filter((teach)                        => teach !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export async function initializeTeach(
  projectRoot        ,
  teachId        ,
)                  {
  if (!TEACH_ID.test(teachId)) {
    throw new KTeachError(
      "validation-failed",
      `Invalid Teach ID: ${teachId}.`,
      "Use lowercase letters, numbers, and single hyphens.",
    );
  }
  const teachRoot = path.join(projectRoot, "teachs", teachId);
  await mkdir(teachRoot, { recursive: true });
  try {
    await writeFile(
      path.join(teachRoot, "teach.yaml"),
      `schema_version: 1\nid: ${teachId}\ntitle: ${teachId}\ntheme_default: classic-manual\n`,
      { encoding: "utf8", flag: "wx" },
    );
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

  await Promise.all(
    [
      "lessons",
      "presentations",
      "publications",
      "learning-records",
      "reference",
      "media",
      ".k-teach/artifacts",
      ".k-teach/attempts",
    ].map((directory) =>
      mkdir(path.join(teachRoot, directory), { recursive: true }),
    ),
  );
  await Promise.all(
    Object.entries(WORKSPACE_DOCUMENTS).map(async ([file, content]) => {
        try {
          await writeFile(path.join(teachRoot, file), content, {
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
  return teachRoot;
}

export async function initializeWorkspace(
  root        ,
  initialTeach = "main",
  wechatAccount         ,
)                {
  if (
    path.basename(path.dirname(root)) === "teachs" ||
    await exists(path.join(root, "teach.yaml"))
  ) {
    throw new KTeachError(
      "validation-failed",
      "A Teach cannot be initialized as a Learning Project.",
      "Run k-teach init from the parent Learning Project directory.",
    );
  }
  const configRoot = path.join(root, ".k-teach");
  await mkdir(configRoot, { recursive: true });
  await mkdir(path.join(root, "teachs"), { recursive: true });
  try {
    await writeFile(path.join(configRoot, "config.yaml"), defaultConfig(wechatAccount), {
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
  await initializeTeach(root, initialTeach);
}

async function findProjectRoot(start        )                              {
  let current = path.resolve(start);
  while (true) {
    if (await exists(path.join(current, ".k-teach", "config.yaml"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export async function resolveProjectRoot(start        )                  {
  const projectRoot = await findProjectRoot(start);
  if (projectRoot) return projectRoot;
  throw new KTeachError(
    "invalid-workspace",
    "K Teach Learning Project not found.",
    "Run k-teach init in the project directory.",
  );
}

export async function resolveWorkspaceRoot(
  start        ,
  teachId         ,
)                  {
  const projectRoot = await findProjectRoot(start);
  if (projectRoot) {
    if (teachId) return path.join(projectRoot, "teachs", teachId);
    const relative = path.relative(path.join(projectRoot, "teachs"), start);
    const [currentTeach] = relative.split(path.sep);
    if (
      currentTeach &&
      currentTeach !== ".." &&
      !path.isAbsolute(relative) &&
      await exists(path.join(projectRoot, "teachs", currentTeach, "teach.yaml"))
    ) {
      return path.join(projectRoot, "teachs", currentTeach);
    }
    const entries = (await readdir(path.join(projectRoot, "teachs"), {
      withFileTypes: true,
    })).filter((entry) => entry.isDirectory());
    if (entries.length === 1) {
      return path.join(projectRoot, "teachs", entries[0].name);
    }
    throw new KTeachError(
      "validation-failed",
      "Multiple Teachs exist and none was selected.",
      "Run from a teachs/<id> directory or pass --teach <id>.",
    );
  }

  const legacy = path.join(path.resolve(start), "k-teach");
  if (await exists(path.join(legacy, "config.yaml"))) return legacy;
  return legacy;
}

export async function resolveProjectConfigRoot(teachRoot        )                  {
  const projectRoot = await findProjectRoot(teachRoot);
  return projectRoot ? path.join(projectRoot, ".k-teach") : teachRoot;
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
  if (await exists(path.join(root, ".k-teach", ".k-teach"))) {
    throw new KTeachError(
      "invalid-workspace",
      "Nested .k-teach/.k-teach output directory detected.",
      "Move or remove the inner .k-teach directory, then run validate again.",
    );
  }
  if (
    await exists(path.join(root, "teach.yaml")) ||
    await exists(path.join(root, "config.yaml"))
  ) return;
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