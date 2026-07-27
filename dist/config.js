import { readFile } from "node:fs/promises";
import path from "node:path";

import { KTeachError } from "./errors.js";

                                                     

                               
                    
                         
                     
                      
                          
 

                                          
              
                        
                                                      
 

const DEFAULT_CONFIG               = {
  schema_version: 1,
  design_profile: "field-manual",
  output_dir: ".k-teach/output",
  visuals: "auto",
};

const ALLOWED_KEYS = new Set([
  "schema_version",
  "design_profile",
  "output_dir",
  "visuals",
  "wechat_account",
]);

function parseScalar(value        )                            {
  if (/^-?\d+$/.test(value)) return Number(value);
  if (value === "true") return true;
  if (value === "false") return false;
  return value.replace(/^(['"])(.*)\1$/, "$2");
}

function parseFlatYaml(source        )                          {
  const result                          = {};
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

async function readOptionalYaml(filePath        )                                   {
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
  value                         ,
)                                                          {
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
      "Run k-teach init in an empty directory or correct k-teach.yaml.",
    );
  }
}

export async function resolveConfig(
  options                         ,
)                        {
  const user = await readOptionalYaml(
    path.join(options.userConfigDir, "config.yaml"),
  );
  const workspace = await readOptionalYaml(
    path.join(options.cwd, "k-teach.yaml"),
  );
  const resolved                          = {
    ...DEFAULT_CONFIG,
    ...user,
    ...workspace,
    ...(options.cli ?? {}),
  };
  assertConfig(resolved);
  return resolved;
}


//# sourceURL=k-teach/src/config.ts