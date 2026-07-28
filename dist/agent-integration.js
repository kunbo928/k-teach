import { access, cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { KTeachError } from "./errors.js";









// Vendored from Fission-AI/OpenSpec at fc886af7f93068482bbf2c66fd1eb76b40c6a22f.
export const AGENT_TOOLS                       = [
  { name: "Amazon Q Developer", value: "amazon-q", skillsDir: ".amazonq" },
  { name: "Antigravity", value: "antigravity", skillsDir: ".agent" },
  { name: "Auggie (Augment CLI)", value: "auggie", skillsDir: ".augment" },
  { name: "Bob Shell", value: "bob", skillsDir: ".bob" },
  { name: "Claude Code", value: "claude", skillsDir: ".claude" },
  { name: "Cline", value: "cline", skillsDir: ".cline" },
  { name: "CodeArts", value: "codeartsagent", skillsDir: ".codeartsdoer" },
  { name: "Codex", value: "codex", skillsDir: ".codex" },
  { name: "ForgeCode", value: "forgecode", skillsDir: ".forge" },
  { name: "CodeBuddy Code", value: "codebuddy", skillsDir: ".codebuddy" },
  { name: "Continue", value: "continue", skillsDir: ".continue" },
  { name: "CoStrict", value: "costrict", skillsDir: ".cospec" },
  { name: "Crush", value: "crush", skillsDir: ".crush" },
  { name: "Cursor", value: "cursor", skillsDir: ".cursor" },
  { name: "Factory Droid", value: "factory", skillsDir: ".factory" },
  { name: "Gemini CLI", value: "gemini", skillsDir: ".gemini" },
  {
    name: "GitHub Copilot",
    value: "github-copilot",
    skillsDir: ".github",
    detectionPaths: [
      ".github/copilot-instructions.md",
      ".github/instructions",
      ".github/workflows/copilot-setup-steps.yml",
      ".github/prompts",
      ".github/agents",
      ".github/skills",
      ".github/.mcp.json",
    ],
  },
  {
    name: "Hermes Agent",
    value: "hermes",
    skillsDir: ".hermes",
    detectionPaths: [".hermes", "HERMES.md", ".hermes.md"],
    setupNote:
      "Hermes requires this project's .hermes/skills directory in skills.external_dirs.",
  },
  { name: "iFlow", value: "iflow", skillsDir: ".iflow" },
  { name: "Junie", value: "junie", skillsDir: ".junie" },
  { name: "Kilo Code", value: "kilocode", skillsDir: ".kilocode" },
  {
    name: "Kimi Code",
    value: "kimi",
    skillsDir: ".kimi-code",
    detectionPaths: [".kimi-code", ".kimi"],
  },
  { name: "Kiro", value: "kiro", skillsDir: ".kiro" },
  { name: "Lingma", value: "lingma", skillsDir: ".lingma" },
  { name: "Mistral Vibe", value: "vibe", skillsDir: ".vibe" },
  { name: "Oh My Pi", value: "oh-my-pi", skillsDir: ".omp" },
  { name: "OpenCode", value: "opencode", skillsDir: ".opencode" },
  { name: "Pi", value: "pi", skillsDir: ".pi" },
  { name: "Qoder", value: "qoder", skillsDir: ".qoder" },
  { name: "Qwen Code", value: "qwen", skillsDir: ".qwen" },
  { name: "Zoo Code", value: "roocode", skillsDir: ".roo" },
  { name: "Trae", value: "trae", skillsDir: ".trae" },
  { name: "Windsurf", value: "windsurf", skillsDir: ".windsurf" },
  { name: "ZCode", value: "zcode", skillsDir: ".zcode" },
];

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function exists(target        )                   {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export async function detectedTools(projectRoot        )                       {
  const detected              = [];
  for (const tool of AGENT_TOOLS) {
    const candidates =
      tool.detectionPaths ?? [tool.skillsDir];
    for (const candidate of candidates) {
      if (await exists(path.join(projectRoot, candidate))) {
        detected.push(tool);
        break;
      }
    }
  }
  return detected;
}

export async function configuredTools(projectRoot        )                       {
  const configured              = [];
  for (const tool of AGENT_TOOLS) {
    if (
      await exists(
        path.join(
          projectRoot,
          tool.skillsDir,
          "skills",
          "k-teach",
          "SKILL.md",
        ),
      )
    ) {
      configured.push(tool);
    }
  }
  return configured;
}

export function selectTools(value                    )              {
  if (!value) return [];
  const ids = value.split(",").map((id) => id.trim()).filter(Boolean);
  if (ids.includes("all")) {
    if (ids.length !== 1) {
      throw new KTeachError(
        "validation-failed",
        '"all" cannot be combined with other tool IDs.',
        "Pass --tools all or a comma-separated list of tool IDs.",
      );
    }
    return [...AGENT_TOOLS];
  }
  if (ids.includes("none")) {
    if (ids.length !== 1) {
      throw new KTeachError(
        "validation-failed",
        '"none" cannot be combined with other tool IDs.',
        "Pass --tools none or a comma-separated list of tool IDs.",
      );
    }
    return [];
  }
  if (new Set(ids).size !== ids.length) {
    throw new KTeachError(
      "validation-failed",
      "Duplicate tool IDs are not allowed.",
      "Pass each tool ID once.",
    );
  }
  return ids.map((id) => {
    const tool = AGENT_TOOLS.find((candidate) => candidate.value === id);
    if (!tool) {
      throw new KTeachError(
        "validation-failed",
        `Unknown Agent tool: ${id}.`,
        `Use one of: ${AGENT_TOOLS.map((candidate) => candidate.value).join(", ")}.`,
      );
    }
    return tool;
  });
}

function generatedSkill(source        , version        )         {
  const pathCommands = source.replaceAll("node bin/k-teach.js", "k-teach");
  return pathCommands.replace(
    /^---\n/,
    `---\nmetadata:\n  generatedBy: "${version}"\n`,
  );
}

async function writeIfChanged(target        , content        )                {
  const current = await readFile(target, "utf8").catch(() => undefined);
  if (current === content) return;
  await writeFile(target, content, "utf8");
}

export async function installAgentIntegrations(
  projectRoot        ,
  tools                      ,
  version        ,
)                {
  const sourceSkill = await readFile(path.join(packageRoot, "SKILL.md"), "utf8");
  for (const tool of tools) {
    const target = path.resolve(
      projectRoot,
      tool.skillsDir,
      "skills",
      "k-teach",
    );
    const relative = path.relative(projectRoot, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new KTeachError(
        "validation-failed",
        `Unsafe Agent Integration path for ${tool.value}.`,
        "Review the vendored Agent registry.",
      );
    }
    await mkdir(target, { recursive: true });
    await writeIfChanged(
      path.join(target, "SKILL.md"),
      generatedSkill(sourceSkill, version),
    );
    for (const directory of ["references", "agents"]) {
      await cp(path.join(packageRoot, directory), path.join(target, directory), {
        recursive: true,
        force: true,
      });
    }
    for (const directory of [
      "lesson-bundle",
      "publication-brief",
      "visuals",
    ]) {
      const source = path.join(packageRoot, "assets", directory);
      if ((await stat(source).catch(() => undefined))?.isDirectory()) {
        await cp(source, path.join(target, "assets", directory), {
          recursive: true,
          force: true,
        });
      }
    }
  }
}


//# sourceURL=k-teach/src/agent-integration.ts