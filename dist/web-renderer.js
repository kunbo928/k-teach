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
import markedKatex from "marked-katex-extension";
import { parse } from "yaml";


import {
  resolveEmbeddedAssets,

} from "./embedded-assets.js";
import { KTeachError } from "./errors.js";
import {
  readExercises,
  validateLessonBundles,

} from "./lesson-bundle.js";
import { resolveVisualAssets } from "./visuals.js";

marked.use(
  markedKatex({
    throwOnError: false,
    output: "htmlAndMathml",
  }),
  {
    renderer: {
      image({ href, text, title }) {
        const source = href.startsWith("../media/")
          ? escapeHtml(href)
          : safeHttpUrl(href);
        const caption = title || text;
        return `<figure class="lesson-figure">
  <img src="${source}" alt="${escapeHtml(text)}" loading="lazy">
  ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}
</figure>`;
      },
    },
  },
);












function escapeHtml(value         )         {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeHttpUrl(value        )         {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("Only HTTP sources can be rendered.");
  return escapeHtml(url.href);
}

async function readMediaFiles(
  directory        ,
  prefix = "",
)                                                          {
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  );
  const files                                                 = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const relativePath = path.posix.join(prefix, entry.name);
    const source = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new KTeachError(
        "invalid-bundle",
        `Lesson media cannot contain symbolic links: media/${relativePath}.`,
        "Replace the link with a local media file and render again.",
      );
    }
    if (entry.isDirectory()) {
      files.push(...(await readMediaFiles(source, relativePath)));
    } else if (entry.isFile() && entry.name !== ".gitkeep") {
      files.push({ relativePath, bytes: await readFile(source) });
    }
  }
  return files;
}

async function loadLessons(root        )                            {
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
      const exercises = await readExercises(
        path.join(directory, "exercises"),
        entry.name,
      );
      const metadata = parse(metadataText)                ;
      const visuals = await resolveVisualAssets(root, directory, metadata);
      const embedded = await resolveEmbeddedAssets(
        directory,
        metadata,
        markdown,
      );
      const mediaFiles = await readMediaFiles(path.join(directory, "media"));
      return {
        directory,
        metadata,
        markdown,
        exercises,
        embeddedAssets: embedded.assets,
        mediaFiles,
        warnings: visuals.warnings,
        inputHash: createHash("sha256")
          .update(metadataText)
          .update(markdown)
          .update(JSON.stringify(exercises))
          .update(
            mediaFiles
              .map(({ relativePath, bytes }) =>
                createHash("sha256")
                  .update(relativePath)
                  .update(bytes)
                  .digest("hex"),
              )
              .join(":"),
          )
          .update(visuals.inputFingerprint)
          .update(embedded.inputFingerprint)
          .digest("hex"),
      };
    }),
  );
}

function renderExercise(exercise          , index        )         {
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

function renderSources(metadata              )         {
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

function documentShell(title        , body        , assetPrefix        )         {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="${assetPrefix}assets/field-manual.css">
  <link rel="stylesheet" href="${assetPrefix}assets/katex.min.css">
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

function renderLesson(lesson                )         {
  const metadata = lesson.metadata;
  const mediaPrefix = `../media/${encodeURIComponent(metadata.id)}/`;
  const exercisesById = new Map(
    lesson.exercises.map((exercise, index) => [
      exercise.id,
      renderExercise(exercise, index),
    ]),
  );
  const semanticMarkdown = lesson.markdown
    .replace(/^#\s+[^\n]+\n+/, "")
    .replaceAll(/\]\(media\//g, `](${mediaPrefix}`)
    .replace(
      /\{\{asset:([A-Za-z0-9][A-Za-z0-9_-]*)\}\}/g,
      (_marker, id        ) =>
        renderEmbeddedAsset(lesson.embeddedAssets.get(id) , mediaPrefix),
    )
    .replace(
      /\{\{exercise:([A-Za-z0-9][A-Za-z0-9_-]*)\}\}/g,
      (_marker, id        ) => exercisesById.get(id) ,
    );
  const content = marked.parse(semanticMarkdown, {
    gfm: true,
    async: false,
  })          ;
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
  </div>
</main>`;
  return documentShell(metadata.title, body, "../");
}

function renderEmbeddedAsset(
  asset               ,
  mediaPrefix        ,
)         {
  const source = `${mediaPrefix}${asset.source.slice("media/".length)}`;
  const heading = `<figcaption><strong>${escapeHtml(asset.title)}</strong><span>${escapeHtml(asset.description)}</span></figcaption>`;
  if (asset.kind === "interactive") {
    return `<figure class="lesson-figure interactive-asset">
  <iframe src="${escapeHtml(source)}" title="${escapeHtml(asset.title)}" loading="lazy" sandbox="allow-scripts"></iframe>
  ${heading}
</figure>`;
  }
  if (asset.kind === "audio") {
    return `<figure class="lesson-figure audio-asset">
  <audio controls preload="metadata" src="${escapeHtml(source)}">你的浏览器不支持音频播放。</audio>
  ${heading}
  <details class="asset-transcript"><summary>阅读语音文字稿</summary><p>${escapeHtml(asset.transcript ?? "")}</p></details>
</figure>`;
  }
  return `<figure class="lesson-figure">
  <img src="${escapeHtml(source)}" alt="${escapeHtml(asset.description)}" loading="lazy">
  ${heading}
</figure>`;
}

function renderIndex(lessons                  )         {
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

export async function renderWeb(root        , outputDir        )                  {
  const lessons = await loadLessons(root);
  const output = path.resolve(root, outputDir, "web");
  const lessonsOutput = path.join(output, "lessons");
  const assetsOutput = path.join(output, "assets");
  const fontsOutput = path.join(assetsOutput, "fonts");
  const mediaOutput = path.join(output, "media");
  await Promise.all([
    mkdir(lessonsOutput, { recursive: true }),
    mkdir(assetsOutput, { recursive: true }),
    mkdir(fontsOutput, { recursive: true }),
    mkdir(mediaOutput, { recursive: true }),
  ]);
  const assetRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../assets/field-manual",
  );
  const katexCss = fileURLToPath(import.meta.resolve("katex/dist/katex.min.css"));
  const katexFonts = fileURLToPath(import.meta.resolve("katex/dist/fonts/KaTeX_Main-Regular.woff2"));
  const katexFontsRoot = path.dirname(katexFonts);
  const katexFontFiles = (await readdir(katexFontsRoot))
    .filter((file) => /\.(?:ttf|woff2?)$/.test(file))
    .sort();
  await Promise.all([
    copyFile(
      path.join(assetRoot, "field-manual.css"),
      path.join(assetsOutput, "field-manual.css"),
    ),
    copyFile(
      path.join(assetRoot, "field-manual.js"),
      path.join(assetsOutput, "field-manual.js"),
    ),
    copyFile(katexCss, path.join(assetsOutput, "katex.min.css")),
    ...katexFontFiles.map((file) =>
      copyFile(path.join(katexFontsRoot, file), path.join(fontsOutput, file)),
    ),
    writeFile(path.join(output, "index.html"), renderIndex(lessons), "utf8"),
    ...lessons.map((lesson) =>
      writeFile(
        path.join(lessonsOutput, `${lesson.metadata.id}.html`),
        renderLesson(lesson),
        "utf8",
      ),
    ),
    ...lessons.flatMap((lesson) =>
      lesson.mediaFiles.map(async ({ relativePath, bytes }) => {
        const destination = path.join(
          mediaOutput,
          lesson.metadata.id,
          ...relativePath.split("/"),
        );
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, bytes);
      }),
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
          "assets/katex.min.css",
          ...katexFontFiles.map((file) => `assets/fonts/${file}`),
          ...lessons.flatMap((lesson) =>
            lesson.mediaFiles.map(
              ({ relativePath }) =>
                `media/${lesson.metadata.id}/${relativePath}`,
            ),
          ),
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


//# sourceURL=k-teach/src/web-renderer.ts