import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { marked, type Token } from "marked";
import { parse } from "yaml";

import type {
  ContextPacket,
  LessonBundle,
  OutputIntent,
  PresentationBrief,
  PublicationBrief,
  SemanticBlockKind,
} from "./domain.ts";
import { KTeachError } from "./errors.ts";
import { readExercises, validateLessonBundles } from "./lesson-bundle.ts";
import { validateDocument } from "./schema.ts";
import { resolveEmbeddedAssets } from "./embedded-assets.ts";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}

function stableId(prefix: string, ...parts: Array<string | number>): string {
  return `${prefix}-${hash(parts).slice(0, 12)}`;
}

async function readYaml(file: string): Promise<unknown> {
  try {
    return parse(await readFile(file, "utf8"));
  } catch {
    throw new KTeachError("validation-failed", `${file} is not valid YAML.`, "Correct the YAML and retry.");
  }
}

async function resolveLesson(root: string, lessonId: string): Promise<{ root: string; metadata: LessonBundle; markdown: string }> {
  const entries = await readdir(path.join(root, "lessons"), { withFileTypes: true });
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const lessonRoot = path.join(root, "lessons", entry.name);
    const value = await readYaml(path.join(lessonRoot, "lesson.yaml"));
    if ((value as { id?: string }).id === lessonId) {
      return { root: lessonRoot, metadata: value as LessonBundle, markdown: await readFile(path.join(lessonRoot, "lesson.md"), "utf8") };
    }
  }
  throw new KTeachError("validation-failed", `Lesson ${lessonId} was not found.`, "Pass an existing lesson ID.");
}

function tokenBody(token: Token): string {
  return ("raw" in token && typeof token.raw === "string" ? token.raw : "text" in token ? String(token.text) : "").trim();
}

function tokenKind(token: Token): SemanticBlockKind {
  if (token.type === "code") return "code";
  if (token.type === "list") return "list";
  if (token.type === "blockquote") return "quote";
  return "paragraph";
}

async function extractSections(
  lessonRoot: string,
  lessonId: string,
  markdown: string,
  intent: OutputIntent,
  include: string[],
  exclude: string[],
): Promise<ContextPacket["sections"]> {
  const exercises = new Map((await readExercises(path.join(lessonRoot, "exercises"), lessonId)).map((item) => [item.id, item]));
  const selected = include.length > 0 ? new Set(include) : undefined;
  const omitted = new Set(exclude);
  const sections: ContextPacket["sections"] = [];
  let current: ContextPacket["sections"][number] | undefined;
  for (const token of marked.lexer(markdown)) {
    if (token.type === "heading" && token.depth === 2) {
      const heading = token.text.trim();
      current = selected && !selected.has(heading) || omitted.has(heading)
        ? undefined
        : { id: stableId("section", heading), heading, blocks: [] };
      if (current) sections.push(current);
      continue;
    }
    if (!current || token.type === "space") continue;
    const body = tokenBody(token);
    if (!body) continue;
    const exerciseMatch = body.match(/^\{\{exercise:([A-Za-z0-9_-]+)\}\}$/);
    if (exerciseMatch) {
      if (intent === "wechat") continue;
      const exercise = exercises.get(exerciseMatch[1]);
      if (!exercise) continue;
      current.blocks.push({
        id: stableId("block", current.id, current.blocks.length, "exercise"),
        kind: "exercise",
        body: canonical(exercise),
        asset_ids: [],
      });
      continue;
    }
    const assetMatch = body.match(/^\{\{asset:([A-Za-z0-9_-]+)\}\}$/);
    current.blocks.push({
      id: stableId("block", current.id, current.blocks.length, token.type),
      kind: assetMatch ? "asset" : tokenKind(token),
      body: assetMatch ? "" : body,
      asset_ids: assetMatch ? [assetMatch[1]] : [],
    });
  }
  return sections;
}

export async function createContextPacket(root: string, intent: OutputIntent, lessonId: string, briefId?: string): Promise<ContextPacket> {
  await validateLessonBundles(root);
  const teach = await readYaml(path.join(root, "teach.yaml")) as { id: string; title: string };
  const lesson = await resolveLesson(root, lessonId);
  let brief: PublicationBrief | PresentationBrief | undefined;
  if (intent !== "learn") {
    if (!briefId) throw new KTeachError("validation-failed", `A brief is required for ${intent}.`, "Pass --brief <id>.");
    const directory = intent === "wechat" ? "publications" : "presentations";
    brief = await readYaml(path.join(root, directory, `${briefId}.yaml`)) as PublicationBrief | PresentationBrief;
    if (intent === "wechat" && brief.schema_version !== 2) throw new KTeachError("migration-required", "Publication Brief V1 is no longer supported.", "Create a current Publication Brief V2; no compatibility conversion is performed.");
    const schema = intent === "wechat" ? "publication-brief" : "presentation-brief";
    const errors = await validateDocument(schema, brief);
    if (errors.length) throw new KTeachError("validation-failed", `${briefId}: ${errors.join("; ")}.`, "Correct the brief and retry.");
    if (brief.lesson_id !== lessonId || brief.lesson_revision !== lesson.metadata.revision) {
      throw new KTeachError("validation-failed", `${briefId} does not target the current lesson revision.`, "Refresh the brief before generating context.");
    }
  }
  const include = brief?.include ?? [];
  const exclude = brief?.exclude ?? [];
  const sections = (await extractSections(lesson.root, lessonId, lesson.markdown, intent, include, exclude))
    .filter((section) => intent !== "wechat" || section.blocks.length > 0);
  const selectedAssetIds = new Set(sections.flatMap((section) => section.blocks.flatMap((block) => block.asset_ids)));
  const embedded = await resolveEmbeddedAssets(lesson.root, lesson.metadata, lesson.markdown);
  const assets: ContextPacket["assets"] = [...embedded.assets.values()]
    .filter((asset) => selectedAssetIds.has(asset.id))
    .map((asset) => ({ id: asset.id, kind: asset.kind, title: asset.title, alt_or_transcript: asset.transcript ?? asset.description, availability: "ready" }));
  const route = brief ? { ...brief } : {};
  const sources = lesson.metadata.sources.map((source) => ({ id: stableId("source", source.url), ...source }));
  const base = {
    schema_version: 1 as const,
    intent,
    teach: { id: teach.id, title: teach.title },
    lesson: {
      id: lesson.metadata.id,
      revision: lesson.metadata.revision,
      title: lesson.metadata.title,
      mission: lesson.metadata.mission,
      objectives: lesson.metadata.objectives,
    },
    sections,
    sources,
    assets,
    route,
    diagnostics: { missing_fields: [], blockers: [], warnings: [] },
  };
  const planningRoute = intent === "wechat" && brief
    ? Object.fromEntries(Object.entries(route).filter(([key]) => ["id", "revision", "lesson_id", "lesson_revision", "title", "audience", "angle", "include", "exclude", "article_type"].includes(key)))
    : route;
  const planningHash = hash({ ...base, route: planningRoute });
  const inputHash = hash(base);
  const packet: ContextPacket = {
    ...base,
    packet_id: `ctx-${inputHash.slice(0, 16)}`,
    provenance: {
      input_hash: inputHash,
      planning_hash: planningHash,
      lesson_revision: lesson.metadata.revision,
      ...(brief ? { brief_revision: brief.revision } : {}),
    },
  };
  const errors = await validateDocument("context-packet", packet);
  if (errors.length) throw new KTeachError("validation-failed", `Context Packet: ${errors.join("; ")}.`, "Report this K Teach contract error.");
  return packet;
}
