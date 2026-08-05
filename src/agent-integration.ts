import {
  access,
  cp,
  lstat,
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { KTeachError } from "./errors.ts";

export interface AgentTool {
  name: string;
  value: string;
  skillsDir: string;
  detectionPaths?: readonly string[];
  setupNote?: string;
}

// Vendored from Fission-AI/OpenSpec at fc886af7f93068482bbf2c66fd1eb76b40c6a22f.
export const AGENT_TOOLS: readonly AgentTool[] = [
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
  {
    name: "WorkBuddy",
    value: "workbuddy",
    skillsDir: ".workbuddy",
    detectionPaths: [".workbuddy"],
  },
];

// Canonical install location shared by every Agent that reads `.agents/skills`
// (Codex, Cursor, Gemini CLI, OpenCode, GitHub Copilot) and used as the single
// source of truth for the per-Agent symlinks created by installAgentIntegrations.
export const CANONICAL_SKILLS_DIR = ".agents";
export const CANONICAL_SKILL_NAME = "k-teach";

export function canonicalSkillRoot(projectRoot: string): string {
  return path.resolve(projectRoot, CANONICAL_SKILLS_DIR, "skills", CANONICAL_SKILL_NAME);
}

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function exists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export async function detectedTools(projectRoot: string): Promise<AgentTool[]> {
  const detected: AgentTool[] = [];
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

export async function configuredTools(projectRoot: string): Promise<AgentTool[]> {
  const configured: AgentTool[] = [];
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

export function selectTools(value: string | undefined): AgentTool[] {
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

function generatedSkill(source: string, version: string): string {
  void version;
  const pathCommands = source.replaceAll("node bin/k-teach.js", "k-teach");
  return pathCommands;
}

async function writeIfChanged(target: string, content: string): Promise<void> {
  const current = await readFile(target, "utf8").catch(() => undefined);
  if (current === content) return;
  await writeFile(target, content, "utf8");
}

export interface InstallOptions {
  /** Copy the canonical Skill into each Agent directory instead of symlinking. */
  copy?: boolean;
}

async function removeLinkOrDir(target: string): Promise<void> {
  const info = await lstat(target).catch(() => undefined);
  if (!info) return;
  if (info.isSymbolicLink() || info.isFile()) {
    await unlink(target);
  } else {
    await rm(target, { recursive: true, force: true });
  }
}

export async function installAgentIntegrations(
  projectRoot: string,
  tools: readonly AgentTool[],
  version: string,
  opts: InstallOptions = {},
): Promise<void> {
  if (
    path.basename(path.dirname(projectRoot)) === "teachs" ||
    await exists(path.join(projectRoot, "teach.yaml"))
  ) {
    throw new KTeachError(
      "validation-failed",
      "Agent Integrations cannot be installed inside a Teach.",
      "Run k-teach init or update from the Learning Project root.",
    );
  }
  if (tools.length === 0) return;

  const canonical = canonicalSkillRoot(projectRoot);
  if (path.relative(projectRoot, canonical).startsWith("..")) {
    throw new KTeachError(
      "validation-failed",
      "Unsafe canonical Agent Skill path.",
      "Review the vendored Agent registry.",
    );
  }

  const sourceSkill = await readFile(path.join(packageRoot, "SKILL.md"), "utf8");
  await mkdir(canonical, { recursive: true });
  await writeIfChanged(
    path.join(canonical, "SKILL.md"),
    generatedSkill(sourceSkill, version),
  );
  for (const directory of ["references", "agents"]) {
    await cp(path.join(packageRoot, directory), path.join(canonical, directory), {
      recursive: true,
      force: true,
    });
  }
  for (const directory of ["lesson-bundle", "publication-brief", "visuals"]) {
    const source = path.join(packageRoot, "assets", directory);
    if ((await stat(source).catch(() => undefined))?.isDirectory()) {
      await cp(source, path.join(canonical, "assets", directory), {
        recursive: true,
        force: true,
      });
    }
  }

  for (const tool of tools) {
    const toolSkills = path.resolve(projectRoot, tool.skillsDir, "skills");
    if (path.relative(projectRoot, toolSkills).startsWith("..")) {
      throw new KTeachError(
        "validation-failed",
        `Unsafe Agent Integration path for ${tool.value}.`,
        "Review the vendored Agent registry.",
      );
    }
    const linkTarget = path.join(toolSkills, CANONICAL_SKILL_NAME);
    // Agents whose Skills directory IS `.agents` read the canonical copy
    // directly, so no symlink is needed.
    if (path.resolve(projectRoot, tool.skillsDir) === path.resolve(projectRoot, CANONICAL_SKILLS_DIR)) {
      continue;
    }
    await mkdir(toolSkills, { recursive: true });
    await removeLinkOrDir(linkTarget);
    if (opts.copy) {
      await cp(canonical, linkTarget, { recursive: true, force: true });
    } else {
      const relative = path.relative(toolSkills, canonical);
      await symlink(relative, linkTarget);
    }
  }
}
