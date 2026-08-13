import { readFile } from "node:fs/promises";
import path from "node:path";

import { KTeachError } from "./errors.ts";

export type VisualMode = "auto" | "required" | "off";

export interface KTeachConfig {
  schema_version: 1;
  design_profile: string;
  output_dir: string;
  visuals: VisualMode;
  wechat_account?: string;
}

export interface ConfigResolutionOptions {
  cwd: string;
  userConfigDir: string;
  cli?: Partial<Omit<KTeachConfig, "schema_version">>;
}

const DEFAULT_CONFIG: KTeachConfig = {
  schema_version: 1,
  design_profile: "field-manual",
  output_dir: "main",
  visuals: "auto",
};

const ALLOWED_KEYS = new Set([
  "schema_version",
  "design_profile",
  "output_dir",
  "visuals",
  "wechat_account",
]);

function parseScalar(value: string): string | number | boolean {
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value === "true") return true;
  if (value === "false") return false;
  return value.replace(/^(['"])(.*)\1$/, "$2");
}

function parseFlatYaml(source: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator < 1) {
      throw new KTeachError(
        "invalid-workspace",
        `Invalid configuration at line ${index + 1}.`,
        "Use one key: value pair per line.",
      );
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    result[key] = parseScalar(value);
  }
  return result;
}

async function readOptionalYaml(filePath: string): Promise<Record<string, unknown>> {
  try {
    return parseFlatYaml(await readFile(filePath, "utf8"));
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {};
    }
    throw error;
  }
}

function assertConfig(
  value: Record<string, unknown>,
): asserts value is Record<string, unknown> & KTeachConfig {
  const unknownKeys = Object.keys(value).filter((key) => !ALLOWED_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw new KTeachError(
      "invalid-workspace",
      `Unsupported configuration keys: ${unknownKeys.join(", ")}.`,
      "Remove unknown keys; credentials belong in environment variables or the system credential store.",
      { keys: unknownKeys },
    );
  }
  if (
    value.schema_version !== 1 ||
    typeof value.design_profile !== "string" ||
    typeof value.output_dir !== "string" ||
    !["auto", "required", "off"].includes(String(value.visuals)) ||
    (value.wechat_account !== undefined &&
      typeof value.wechat_account !== "string")
  ) {
    throw new KTeachError(
      "invalid-workspace",
      "Configuration does not match schema version 1.",
      "Run k-teach init in a new project or correct k-teach/config.yaml.",
    );
  }
}

export async function resolveConfig(
  options: ConfigResolutionOptions,
): Promise<KTeachConfig> {
  const user = await readOptionalYaml(
    path.join(options.userConfigDir, "config.yaml"),
  );
  const workspace = await readOptionalYaml(
    path.join(options.cwd, "config.yaml"),
  );
  const resolved: Record<string, unknown> = {
    ...DEFAULT_CONFIG,
    ...user,
    ...workspace,
    ...(options.cli ?? {}),
  };
  assertConfig(resolved);
  const projectRoot = path.basename(options.cwd) === ".k-teach"
    ? path.dirname(options.cwd)
    : options.cwd;
  return {
    ...resolved,
    output_dir: path.resolve(projectRoot, resolved.output_dir),
  };
}

export function resolveTeachOutputDirectory(
  configuredOutput: string,
  teachRoot: string,
): string {
  return path.basename(configuredOutput) === "main"
    ? path.join(path.dirname(configuredOutput), path.basename(teachRoot))
    : configuredOutput;
}
