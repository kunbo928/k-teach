import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse } from "yaml";

import { KTeachError } from "./errors.js";
import { validateDocument } from "./schema.js";
                                                

                 
           
                  
           
                 
                    
             

                         
             
                   
                  
                 
                             
 

                             
                    
             
                    
                          
                          
 

                                
                    
                  
                   
                                          
                 
                             
                      
                                                        
                                                                
 

async function readYamlDocument(
  schema 
                           
                              ,
  filePath        ,
)                   {
  let value         ;
  try {
    value = parse(await readFile(filePath, "utf8"));
  } catch (error) {
    throw new KTeachError(
      "validation-failed",
      `Could not read ${path.basename(filePath)}.`,
      "Correct the YAML document and try again.",
      { file: filePath, cause: String(error) },
    );
  }
  const errors = await validateDocument(schema, value);
  if (errors.length > 0) {
    throw new KTeachError(
      "validation-failed",
      `${path.basename(filePath)}: ${errors.join("; ")}.`,
      "Correct the visual contract document and try again.",
      { file: filePath, errors },
    );
  }
  return value;
}

function equalStrings(left          , right          )          {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export async function registerVisualAsset(
  root        ,
  planPath        ,
  resultPath        ,
)                  {
  const plan = (await readYamlDocument(
    "learning-asset-plan",
    planPath,
  ))                     ;
  const result = (await readYamlDocument(
    "visual-provider-result",
    resultPath,
  ))                        ;
  const planned = plan.assets.find((asset) => asset.id === result.asset_id);
  if (
    result.plan_id !== plan.id ||
    !planned ||
    result.prompt !== planned.prompt ||
    !equalStrings(result.input_references, planned.input_references)
  ) {
    throw new KTeachError(
      "validation-failed",
      "Provider result does not match the authoritative Learning Asset Plan.",
      "Regenerate the result from the unchanged plan, prompt, and input references.",
      { plan_id: plan.id, asset_id: result.asset_id },
    );
  }
  if (result.validation.status !== "passed") {
    throw new KTeachError(
      "validation-failed",
      "Provider result has not passed validation.",
      "Review the generated asset and record passed validation checks before registration.",
      { asset_id: result.asset_id },
    );
  }
  const assetPath = path.resolve(path.dirname(resultPath), result.output_path);
  const [canonicalRoot, canonicalAssetPath] = await Promise.all([
    realpath(root),
    realpath(assetPath).catch(() => assetPath),
  ]);
  const relativeAssetPath = path.relative(canonicalRoot, canonicalAssetPath);
  if (
    path.isAbsolute(relativeAssetPath) ||
    relativeAssetPath === ".." ||
    relativeAssetPath.startsWith(`..${path.sep}`)
  ) {
    throw new KTeachError(
      "validation-failed",
      "Generated visual must remain inside the Learning Workspace.",
      "Move the generated file into the lesson media directory and update output_path.",
    );
  }
  let bytes        ;
  try {
    bytes = await readFile(canonicalAssetPath);
  } catch (error) {
    throw new KTeachError(
      "validation-failed",
      `Generated visual is not readable: ${result.output_path}.`,
      "Create the provider output at the recorded path and register again.",
      { cause: String(error) },
    );
  }
  const record = {
    schema_version: 1,
    plan_id: plan.id,
    asset_id: planned.id,
    lesson_id: plan.lesson_id,
    lesson_revision: plan.lesson_revision,
    kind: planned.kind,
    purpose: planned.purpose,
    provider: result.provider,
    prompt: planned.prompt,
    input_references: planned.input_references,
    output_path: relativeAssetPath.split(path.sep).join("/"),
    media_type: result.media_type,
    content_hash: createHash("sha256").update(bytes).digest("hex"),
    validation: result.validation,
  };
  const errors = await validateDocument("visual-asset-record", record);
  if (errors.length > 0) {
    throw new KTeachError(
      "validation-failed",
      `Visual asset record is invalid: ${errors.join("; ")}.`,
      "Correct the provider result and register again.",
    );
  }
  const directory = path.join(
    root,
    ".k-teach",
    "artifacts",
    "visuals",
    plan.id,
  );
  await mkdir(directory, { recursive: true });
  const recordPath = path.join(directory, `${planned.id}.json`);
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return recordPath;
}

                                   
                     
                           
                              
 

export async function resolveVisualAssets(
  root        ,
  lessonDirectory        ,
  lesson              ,
)                            {
  if (lesson.visuals === "off") {
    return { warnings: [], inputFingerprint: "visuals:off", availableAssetIds: [] };
  }
  const planPath = path.join(lessonDirectory, "media", "visual-plan.yaml");
  let planSource        ;
  try {
    planSource = await readFile(planPath, "utf8");
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      if (lesson.visuals === "required") {
        throw new KTeachError(
          "missing-capability",
          `${lesson.id}: generated visuals are required but no Learning Asset Plan exists.`,
          "Create media/visual-plan.yaml and register every required provider result, or change visuals to auto/off.",
        );
      }
      return {
        warnings: [],
        inputFingerprint: "visuals:auto:no-plan",
        availableAssetIds: [],
      };
    }
    throw error;
  }
  const planValue = parse(planSource)           ;
  const planErrors = await validateDocument("learning-asset-plan", planValue);
  if (planErrors.length > 0) {
    throw new KTeachError(
      "invalid-bundle",
      `${lesson.id} visual-plan.yaml: ${planErrors.join("; ")}.`,
      "Correct the Learning Asset Plan and render again.",
      { errors: planErrors },
    );
  }
  const plan = planValue                     ;
  if (
    plan.lesson_id !== lesson.id ||
    plan.lesson_revision !== lesson.revision
  ) {
    throw new KTeachError(
      "invalid-bundle",
      `${lesson.id}: Learning Asset Plan does not match the current Lesson Bundle revision.`,
      "Regenerate the plan from the current lesson revision.",
    );
  }
  const warnings           = [];
  const availableAssetIds           = [];
  const fingerprints = [planSource];
  for (const asset of plan.assets) {
    const recordPath = path.join(
      root,
      ".k-teach",
      "artifacts",
      "visuals",
      plan.id,
      `${asset.id}.json`,
    );
    let recordSource        ;
    try {
      recordSource = await readFile(recordPath, "utf8");
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        if (lesson.visuals === "required") {
          throw new KTeachError(
            "missing-capability",
            `${lesson.id}: required visual ${asset.id} has no registered provider result.`,
            "Generate, validate, and register the visual result, or change visuals to auto/off.",
            { plan_id: plan.id, asset_id: asset.id },
          );
        }
        warnings.push(
          `${lesson.id}: optional visual ${asset.id} unavailable; rendered without it.`,
        );
        continue;
      }
      throw error;
    }
    const record = JSON.parse(recordSource)           ;
    const recordErrors = await validateDocument("visual-asset-record", record);
    if (recordErrors.length > 0) {
      throw new KTeachError(
        "render-failed",
        `${lesson.id}: registered visual ${asset.id} is invalid.`,
        "Register a valid provider result again.",
        { errors: recordErrors },
      );
    }
    const typed = record     
                      
                       
                        
                              
                     
                                 
                          
                           
     ;
    if (
      typed.plan_id !== plan.id ||
      typed.asset_id !== asset.id ||
      typed.lesson_id !== lesson.id ||
      typed.lesson_revision !== lesson.revision ||
      typed.prompt !== asset.prompt ||
      !equalStrings(typed.input_references, asset.input_references)
    ) {
      throw new KTeachError(
        "render-failed",
        `${lesson.id}: registered visual ${asset.id} is stale or does not match its plan.`,
        "Generate and register the visual from the current Learning Asset Plan.",
      );
    }
    const visualPath = path.resolve(root, typed.output_path);
    const relativeVisualPath = path.relative(root, visualPath);
    if (
      path.isAbsolute(relativeVisualPath) ||
      relativeVisualPath === ".." ||
      relativeVisualPath.startsWith(`..${path.sep}`)
    ) {
      throw new KTeachError(
        "render-failed",
        `${lesson.id}: registered visual ${asset.id} points outside the workspace.`,
        "Register the visual again from a file inside the lesson media directory.",
      );
    }
    let visualBytes        ;
    try {
      visualBytes = await readFile(visualPath);
    } catch (error) {
      throw new KTeachError(
        "render-failed",
        `${lesson.id}: registered visual ${asset.id} is not readable.`,
        "Restore the registered file or register a replacement.",
        { cause: String(error) },
      );
    }
    const currentHash = createHash("sha256").update(visualBytes).digest("hex");
    if (currentHash !== typed.content_hash) {
      throw new KTeachError(
        "render-failed",
        `${lesson.id}: registered visual ${asset.id} content has changed.`,
        "Validate and register the changed provider output as a new asset record.",
      );
    }
    fingerprints.push(recordSource);
    fingerprints.push(currentHash);
    availableAssetIds.push(asset.id);
  }
  return {
    warnings,
    inputFingerprint: createHash("sha256")
      .update(fingerprints.join("\n"))
      .digest("hex"),
    availableAssetIds,
  };
}


//# sourceURL=k-teach/src/visuals.ts