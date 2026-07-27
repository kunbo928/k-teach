import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { marked } from "marked";
import { parse } from "yaml";

import type { LessonBundle } from "./domain.ts";
import { KTeachError } from "./errors.ts";
import { validateLessonBundles } from "./lesson-bundle.ts";
import { validateDocument } from "./schema.ts";
import { resolveVisualAssets } from "./visuals.ts";

interface Exercise {
  schema_version: 1;
  id: string;
  prompt: string;
  answer: string;
  feedback: string;
}

interface RenderedLesson {
  metadata: LessonBundle;
  markdown: string;
  exercises: Exercise[];
  inputHash: string;
  warnings: string[];
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeHttpUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Only HTTP sources can be rendered.");
  return escapeHtml(url.href);
}

async function readExercises(directory: string): Promise<Exercise[]> {
  const files = (await readdir(directory).catch(() => []))
    .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"))
    .sort();
  const exercises: Exercise[] = [];
  for (const file of files) {
    const value = parse(await readFile(path.join(directory, file), "utf8"));
    const errors = await validateDocument("exercise", value);
    if (errors.length > 0) {
      throw new KTeachError(
        "invalid-bundle",
        `${file}: ${errors.join("; ")}.`,
        "Correct the exercise and run validate again.",
        { file, errors },
      );
    }
    exercises.push(value as Exercise);
  }
  return exercises;
}

async function loadLessons(root: string): Promise<RenderedLesson[]> {
  await validateLessonBundles(root);
  const lessonsRoot = path.join(root, "lessons");
  const entries = (await readdir(lessonsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  return Promise.all(
    entries.map(async (entry) => {
      const directory = path.join(lessonsRoot, entry.name);
      const metadataText = await readFile(
        path.join(directory, "lesson.yaml"),
        "utf8",
      );
      const markdown = await readFile(path.join(directory, "lesson.md"), "utf8");
      const exercises = await readExercises(path.join(directory, "exercises"));
      const metadata = parse(metadataText) as LessonBundle;
      const visuals = await resolveVisualAssets(root, directory, metadata);
      return {
        metadata,
        markdown,
        exercises,
        warnings: visuals.warnings,
        inputHash: createHash("sha256")
          .update(metadataText)
          .update(markdown)
          .update(JSON.stringify(exercises))
          .update(visuals.inputFingerprint)
          .digest("hex"),
      };
    }),
  );
}

function renderExercise(exercise: Exercise, index: number): string {
  const prompt = escapeHtml(exercise.prompt);
  const answer = escapeHtml(exercise.answer);
  const feedback = escapeHtml(exercise.feedback);
  return `<section class="exercise" aria-labelledby="exercise-${index}">
  <h3 id="exercise-${index}">${prompt}</h3>
  <form data-exercise data-answer="${answer}" data-feedback="${feedback}">
    <label for="response-${index}">写下你的答案</label>
    <input id="response-${index}" name="response" autocomplete="off">
    <div class="exercise-actions">
      <button type="submit">检查答案</button>
      <button type="button" class="theme-toggle" data-reset>重新作答</button>
    </div>
    <p class="exercise-feedback" data-feedback aria-live="polite"></p>
  </form>
  <details class="answer-disclosure">
    <summary>查看答案与解析</summary>
    <p><strong>答案：</strong>${answer}</p>
    <p>${feedback}</p>
  </details>
</section>`;
}

function renderSources(metadata: LessonBundle): string {
  if (metadata.sources.length === 0)
    return `<section class="sources"><h2>来源</h2><p>本课没有登记外部来源。</p></section>`;
  return `<section class="sources"><h2>来源</h2><ol>${metadata.sources
    .map(
      (source) =>
        `<li><a href="${safeHttpUrl(source.url)}">${escapeHtml(
          source.title,
        )}</a></li>`,
    )
    .join("")}</ol></section>`;
}

function documentShell(title: string, body: string, assetPrefix: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${assetPrefix}assets/field-manual.css">
  <script src="${assetPrefix}assets/field-manual.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">跳到正文</a>
  <header class="course-header">
    <a class="course-name" href="${assetPrefix}index.html">K Teach 学习手册</a>
    <button class="theme-toggle" type="button" data-theme-toggle>切换阅读主题</button>
  </header>
  ${body}
</body>
</html>`;
}

function renderLesson(lesson: RenderedLesson): string {
  const metadata = lesson.metadata;
  const semanticMarkdown = lesson.markdown.replace(/^#\s+[^\n]+\n+/, "");
  const content = marked.parse(semanticMarkdown, {
    gfm: true,
    async: false,
  }) as string;
  const practice = lesson.exercises.length
    ? `<aside class="practice" aria-label="练习"><h2>现在练习</h2>${lesson.exercises
        .map(renderExercise)
        .join("")}</aside>`
    : "";
  const modeLabel = {
    reading: "概念阅读",
    workshop: "实践课",
    atlas: "关系图谱",
  }[metadata.composition];
  const body = `<main id="main" class="lesson mode-${escapeHtml(
    metadata.composition,
  )}">
  <header class="lesson-hero">
    <p class="lesson-kicker">${escapeHtml(modeLabel)}</p>
    <h1>${escapeHtml(metadata.title)}</h1>
    <p class="outcome">${escapeHtml(metadata.mission)}</p>
    <ul class="objectives">${metadata.objectives
      .map((objective) => `<li>${escapeHtml(objective)}</li>`)
      .join("")}</ul>
  </header>
  <noscript><p class="no-js-notice">JavaScript 未启用。正文、题目和答案仍可阅读，但自动反馈与本地主题偏好不可用。</p></noscript>
  <div class="lesson-body">
    <article class="lesson-content">${content}${renderSources(metadata)}</article>
    ${practice}
  </div>
</main>`;
  return documentShell(metadata.title, body, "../");
}

function renderIndex(lessons: RenderedLesson[]): string {
  const entries = lessons
    .map(
      ({ metadata }) => `<article class="lesson-entry">
  <a href="lessons/${encodeURIComponent(metadata.id)}.html">${escapeHtml(
    metadata.title,
  )}</a>
  <p>${escapeHtml(metadata.mission)}</p>
</article>`,
    )
    .join("");
  const body = `<main id="main" class="course-index">
  <header class="lesson-hero">
    <p class="lesson-kicker">Field Manual</p>
    <h1>你的学习手册</h1>
    <p class="outcome">从使命出发，每次完成一个能够被验证的学习成果。</p>
  </header>
  <section aria-labelledby="lesson-index">
    <h2 id="lesson-index">课程目录</h2>
    <div class="lesson-list">${entries || "<p>还没有 Lesson Bundle。</p>"}</div>
  </section>
</main>`;
  return documentShell("K Teach 学习手册", body, "");
}

export async function renderWeb(root: string, outputDir: string): Promise<string> {
  const lessons = await loadLessons(root);
  const output = path.resolve(root, outputDir, "web");
  const lessonsOutput = path.join(output, "lessons");
  const assetsOutput = path.join(output, "assets");
  await Promise.all([
    mkdir(lessonsOutput, { recursive: true }),
    mkdir(assetsOutput, { recursive: true }),
  ]);
  const assetRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../assets/field-manual",
  );
  await Promise.all([
    copyFile(
      path.join(assetRoot, "field-manual.css"),
      path.join(assetsOutput, "field-manual.css"),
    ),
    copyFile(
      path.join(assetRoot, "field-manual.js"),
      path.join(assetsOutput, "field-manual.js"),
    ),
    writeFile(path.join(output, "index.html"), renderIndex(lessons), "utf8"),
    ...lessons.map((lesson) =>
      writeFile(
        path.join(lessonsOutput, `${lesson.metadata.id}.html`),
        renderLesson(lesson),
        "utf8",
      ),
    ),
  ]);
  const aggregateHash = createHash("sha256")
    .update(lessons.map((lesson) => lesson.inputHash).join(":"))
    .digest("hex");
  await writeFile(
    path.join(output, "artifact-manifest.json"),
    `${JSON.stringify(
      {
        schema_version: 1,
        id: `web-${aggregateHash.slice(0, 12)}`,
        lesson_id: lessons.length === 1 ? lessons[0].metadata.id : "course",
        lesson_revision:
          lessons.length === 1 ? lessons[0].metadata.revision : aggregateHash,
        design_profile_revision: "1",
        channel: "web",
        input_hash: aggregateHash,
        files: [
          "index.html",
          ...lessons.map((lesson) => `lessons/${lesson.metadata.id}.html`),
          "assets/field-manual.css",
          "assets/field-manual.js",
        ],
        capabilities_used: ["lesson-bundle", "web"],
        warnings: lessons.flatMap((lesson) => lesson.warnings),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return output;
}
