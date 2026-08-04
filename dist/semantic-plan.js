import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parse, stringify } from "yaml";


import { validateDocument } from "./schema.js";



function digest(value         )         {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function refsFor(section                                   )                        {
  return section.blocks.map((block) => ({ mode: "reference", source_refs: [block.id] }));
}

function envelope(packet               , kind                     ) {
  const route = packet.route                                      ;
  const id = `${kind}-${route.id ?? packet.lesson.id}`;
  return {
    schema_version: 1         ,
    id,
    revision: `plan-${digest([packet.provenance.planning_hash, kind])}`,
    context: {
      packet_id: packet.packet_id,
      planning_hash: packet.provenance.planning_hash,
      lesson_id: packet.lesson.id,
      lesson_revision: packet.lesson.revision,
    },
    route_brief: { id: route.id ?? packet.lesson.id, revision: route.revision ?? packet.lesson.revision },
  };
}

export function scaffoldSemanticPlan(packet               )               {
  if (packet.intent === "ppt") {
    const route = packet.route                                 ;
    const duration = Math.max(1, Math.floor(((route.duration_minutes ?? 10) * 60) / Math.max(1, packet.sections.length)));
    return {
      ...envelope(packet, "slide"),
      kind: "slide",
      slides: [
        { id: `slide-${digest("cover")}`, role: "cover"         , title: packet.lesson.title, content: [], asset_refs: [], speaker_notes: [], duration_seconds: 60 },
        ...packet.sections.map((section) => ({
        id: `slide-${digest(section.id)}`,
        role: (section.blocks.some((block) => block.kind === "exercise") ? "practice" : "concept")                          ,
        title: section.heading,
        content: refsFor(section),
        asset_refs: [...new Set(section.blocks.flatMap((block) => block.asset_ids))],
        speaker_notes: [],
        duration_seconds: duration,
        })),
        ...(packet.sources.length ? [{ id: `slide-${digest("sources")}`, role: "sources"         , title: "继续探索", content: packet.sources.map((source) => ({ mode: "reference"         , source_refs: [source.id] })), asset_refs: [], speaker_notes: [], duration_seconds: 30 }] : []),
      ],
    };
  }
  return {
    ...envelope(packet, "article"),
    kind: "article",
    blocks: packet.sections.map((section) => ({
      id: `article-${digest(section.id)}`,
      role: "section",
      heading: section.heading,
      content: refsFor(section),
      asset_refs: [...new Set(section.blocks.flatMap((block) => block.asset_ids))],
    })),
  };
}

function planItems(plan              ) {
  return plan.kind === "article" ? plan.blocks : plan.slides;
}

export async function validateSemanticPlan(plan              , packet               )                    {
  const errors = await validateDocument(plan.kind === "article" ? "article-plan" : "slide-plan", plan);
  const blockIds = new Set(packet.sections.flatMap((section) => section.blocks.map((block) => block.id)));
  const sourceIds = new Set(packet.sources.map((source) => source.id));
  const assetIds = new Set(packet.assets.map((asset) => asset.id));
  for (const item of planItems(plan)) {
    const content = plan.kind === "article" ? item.content : item.content;
    for (const entry of content) {
      if (entry.mode === "authored" && entry.text.length > 280) errors.push(`${item.id}: authored text exceeds 280 characters`);
      for (const ref of entry.source_refs) if (!blockIds.has(ref) && !sourceIds.has(ref)) errors.push(`${item.id}: unknown source ref ${ref}`);
    }
    for (const ref of item.asset_refs) if (!assetIds.has(ref)) errors.push(`${item.id}: unknown asset ref ${ref}`);
    if ("speaker_notes" in item) {
      for (const entry of item.speaker_notes) {
        if (entry.mode === "authored" && entry.text.length > 280) errors.push(`${item.id}: authored speaker note exceeds 280 characters`);
        for (const ref of entry.source_refs) if (!blockIds.has(ref) && !sourceIds.has(ref)) errors.push(`${item.id}: unknown speaker-note ref ${ref}`);
      }
    }
  }
  if (plan.context.planning_hash !== packet.provenance.planning_hash) errors.push("plan planning_hash is stale");
  if (plan.context.lesson_revision !== packet.lesson.revision) errors.push("plan lesson_revision is stale");
  const route = packet.route                                      ;
  if (route.id && (plan.route_brief.id !== route.id || plan.route_brief.revision !== route.revision)) errors.push("plan route brief is stale");
  return [...new Set(errors)].sort();
}

function blockMap(packet               )                      {
  return new Map(packet.sections.flatMap((section) => section.blocks.map((block) => [block.id, JSON.stringify(block)])));
}

export function rebaseSemanticPlan(plan              , previous               , current               )                  {
  const before = blockMap(previous);
  const after = blockMap(current);
  const used = new Set        ();
  const unchanged           = [];
  const needs_review                                  = [];
  for (const item of planItems(plan)) {
    const refs = [
      ...item.content.flatMap((entry) => entry.source_refs),
      ...("speaker_notes" in item ? item.speaker_notes.flatMap((entry) => entry.source_refs) : []),
    ].filter((ref) => before.has(ref));
    refs.forEach((ref) => used.add(ref));
    const removed = refs.filter((ref) => !after.has(ref));
    const changed = refs.filter((ref) => after.has(ref) && before.get(ref) !== after.get(ref));
    if (removed.length) needs_review.push({ item_id: item.id, reason: "source_removed", changed_refs: removed });
    else if (changed.length) needs_review.push({ item_id: item.id, reason: "source_changed", changed_refs: changed });
    else unchanged.push(item.id);
  }
  const proposed = [...after.keys()].filter((ref) => !before.has(ref) && !used.has(ref)).sort().map((ref) => ({ item_id: `proposal-${ref}`, reason: "newly_selected_content"          }));
  return { schema_version: 1, unchanged, needs_review, proposed, removed: [] };
}

export function semanticPlanPath(root        , kind                     , briefId        )         {
  return path.join(root, "plans", kind === "article" ? "articles" : "slides", `${briefId}.yaml`);
}

export async function saveSemanticPlan(root        , plan              )                  {
  const file = semanticPlanPath(root, plan.kind, plan.route_brief.id);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, stringify(plan));
  return file;
}

function planSidecarPath(root        , plan              , suffix        )         {
  return semanticPlanPath(root, plan.kind, plan.route_brief.id).replace(/\.yaml$/, suffix);
}

export async function savePlanContextSnapshot(root        , plan              , packet               )                {
  await writeFile(planSidecarPath(root, plan, ".context.json"), `${JSON.stringify(packet)}\n`);
}

export async function loadPlanContextSnapshot(root        , plan              )                                     {
  try { return JSON.parse(await readFile(planSidecarPath(root, plan, ".context.json"), "utf8"))                 ; }
  catch (error) { if ((error                         ).code === "ENOENT") return undefined; throw error; }
}

export async function savePlanReviewDelta(root        , plan              , delta                 )                  {
  const file = planSidecarPath(root, plan, ".review.json");
  await writeFile(file, `${JSON.stringify(delta)}\n`);
  return file;
}

export async function loadSemanticPlan(root        , kind                     , briefId        )                                    {
  try { return parse(await readFile(semanticPlanPath(root, kind, briefId), "utf8"))                ; }
  catch (error) { if ((error                         ).code === "ENOENT") return undefined; throw error; }
}


//# sourceURL=k-teach/src/semantic-plan.ts