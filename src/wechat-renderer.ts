import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { marked, type Token, type Tokens } from "marked";
import sharp from "sharp";
import { parse } from "yaml";

import type { LessonBundle, PublicationBrief } from "./domain.ts";
import { renderDiagramSvg } from "./diagram-renderer.ts";
import { KTeachError } from "./errors.ts";
import { validateLessonBundles } from "./lesson-bundle.ts";
import { validateDocument } from "./schema.ts";
import {
  resolveTeachingTheme,
  type TeachingTheme,
} from "./teaching-themes.ts";

const COLORS = {
  paper: "#F5F1E8",
  ink: "#1C2822",
  muted: "#66716B",
  line: "#BBC3BD",
  accent: "#315C49",
  note: "#E7E8DE",
};

export function applyWechatTheme(
  article: string,
  theme: TeachingTheme,
): string {
  const replacements: Array<[string, string]> = [
    [COLORS.paper, theme.colors.background],
    [COLORS.ink, theme.colors.ink],
    [COLORS.muted, theme.colors.muted],
    [COLORS.line, theme.colors.line],
    [COLORS.accent, theme.colors.accent],
    [COLORS.note, theme.colors.accentSoft],
    ["#202B26", theme.colors.code],
    ["#E8ECE9", theme.id === "future-lab" ? "#EAF5F4" : theme.colors.ink],
  ];
  let themed = article;
  for (const [source, target] of replacements)
    themed = themed.replaceAll(source, target);
  const border =
    theme.pattern === "columns"
      ? `border-top:4px double ${theme.colors.ink}`
      : theme.pattern === "circuit"
        ? `border:1px solid ${theme.colors.line}`
        : `border-top:4px solid ${theme.colors.accent}`;
  return themed
    .replace(
      `border-top:4px solid ${theme.colors.accent}`,
      border,
    )
    .replace(
      "box-sizing:border-box;max-width:100%;",
      `box-sizing:border-box;max-width:100%;border-radius:${theme.radius};`,
    );
}

interface InlineContext {
  citations: Map<string, number>;
  images: Map<string, PreparedMedia>;
}

interface PreparedMedia {
  href: string;
  alt: string;
  bytes: Buffer;
  record: {
    kind: "content-image" | "diagram" | "visual-asset";
    placeholder: string;
    source: string;
    file: string;
    content_hash: string;
  };
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function visibleText(value: unknown): string {
  return escapeHtml(String(value).replaceAll("—", "-").replaceAll("–", "-"));
}

function leaf(value: unknown): string {
  return `<span leaf="">${visibleText(value)}</span>`;
}

function renderInline(tokens: Token[], context: InlineContext): string {
  return tokens
    .map((token) => {
      if (token.type === "text") {
        const nested = (token as Tokens.Text).tokens;
        return nested ? renderInline(nested, context) : leaf((token as Tokens.Text).text);
      }
      if (token.type === "strong") {
        return `<strong style="font-weight:700;color:${COLORS.ink};">${renderInline(
          (token as Tokens.Strong).tokens,
          context,
        )}</strong>`;
      }
      if (token.type === "em") {
        return `<em style="font-style:italic;color:${COLORS.ink};">${renderInline(
          (token as Tokens.Em).tokens,
          context,
        )}</em>`;
      }
      if (token.type === "codespan") {
        return `<span style="padding:2px 5px;border:1px solid ${COLORS.line};border-radius:3px;background:${COLORS.note};font-family:Menlo,Consolas,monospace;font-size:13px;color:${COLORS.ink};">${leaf(
          (token as Tokens.Codespan).text,
        )}</span>`;
      }
      if (token.type === "link") {
        const link = token as Tokens.Link;
        let number = context.citations.get(link.href);
        if (!number) {
          number = context.citations.size + 1;
          context.citations.set(link.href, number);
        }
        return `${renderInline(link.tokens, context)}<sup style="color:${
          COLORS.accent
        };font-size:10px;">${leaf(`[${number}]`)}</sup>`;
      }
      if (token.type === "image") {
        const image = token as Tokens.Image;
        const media = context.images.get(image.href);
        if (!media) return leaf(image.text);
        return `<img src="${media.record.placeholder}" alt="${visibleText(
          image.text,
        )}" style="max-width:100%;height:auto;display:block;margin:0 auto;">`;
      }
      if (token.type === "br") return "<br>";
      if (token.type === "del") {
        return `<span style="text-decoration:line-through;color:${
          COLORS.muted
        };">${renderInline((token as Tokens.Del).tokens, context)}</span>`;
      }
      return leaf("text" in token ? String(token.text) : "");
    })
    .join("");
}

function renderBlock(token: Token, context: InlineContext): string {
  if (token.type === "heading") {
    const heading = token as Tokens.Heading;
    const size = heading.depth === 2 ? "20px" : "17px";
    return `<section style="margin:34px 0 16px;padding-left:12px;border-left:3px solid ${
      COLORS.accent
    };"><h${Math.min(heading.depth, 3)} style="margin:0;font-size:${size};line-height:1.45;font-weight:700;color:${
      COLORS.ink
    };">${renderInline(heading.tokens, context)}</h${Math.min(
      heading.depth,
      3,
    )}></section>`;
  }
  if (token.type === "paragraph") {
    const paragraph = token as Tokens.Paragraph;
    if (
      paragraph.tokens.length === 1 &&
      paragraph.tokens[0].type === "image"
    ) {
      const image = paragraph.tokens[0] as Tokens.Image;
      const media = context.images.get(image.href);
      if (!media) return "";
      const caption = image.text
        ? `<p style="margin:8px 0 20px;text-align:center;font-size:12px;line-height:1.6;color:${
            COLORS.muted
          };">${leaf(image.text)}</p>`
        : "";
      return `<section style="margin:22px 0;"><img src="${
        media.record.placeholder
      }" alt="${visibleText(
        image.text,
      )}" style="max-width:100%;height:auto;display:block;margin:0 auto;">${caption}</section>`;
    }
    return `<p style="margin:0 0 18px;font-size:16px;line-height:1.9;text-align:justify;color:${
      COLORS.ink
    };">${renderInline(paragraph.tokens, context)}</p>`;
  }
  if (token.type === "blockquote") {
    const quote = token as Tokens.Blockquote;
    return `<blockquote style="margin:22px 0;padding:16px 18px;border-left:3px solid ${
      COLORS.accent
    };background:${COLORS.note};color:${COLORS.ink};">${quote.tokens
      .map((child) => renderBlock(child, context))
      .join("")}</blockquote>`;
  }
  if (token.type === "list") {
    const list = token as Tokens.List;
    const tag = list.ordered ? "ol" : "ul";
    const items = list.items
      .map(
        (item) =>
          `<li style="margin:0 0 10px;padding-left:4px;font-size:16px;line-height:1.8;color:${
            COLORS.ink
          };">${renderInline(
            marked.Lexer.lexInline(item.text) as Token[],
            context,
          )}</li>`,
      )
      .join("");
    return `<${tag} style="margin:0 0 20px;padding-left:24px;">${items}</${tag}>`;
  }
  if (token.type === "code") {
    const code = token as Tokens.Code;
    const lines = code.text
      .split("\n")
      .map(
        (line) =>
          `<p style="margin:0;line-height:1.65;">${leaf(line || " ")}</p>`,
      )
      .join("");
    return `<section style="margin:20px 0;padding:16px;border-radius:4px;background:#202B26;color:#E8ECE9;font-family:Menlo,Consolas,monospace;font-size:13px;overflow-wrap:anywhere;">${lines}</section>`;
  }
  if (token.type === "hr") {
    return `<section style="margin:28px auto;border-top:1px solid ${COLORS.line};width:44%;"></section>`;
  }
  return "";
}

function selectBlocks(markdown: string, brief: PublicationBrief): Token[] {
  const tokens = marked.lexer(markdown) as Token[];
  const included = new Set(brief.include);
  const excluded = new Set(brief.exclude);
  const selected: Token[] = [];
  let active = false;
  for (const token of tokens) {
    if (token.type === "heading" && (token as Tokens.Heading).depth === 1) {
      continue;
    }
    if (token.type === "heading" && (token as Tokens.Heading).depth === 2) {
      const title = (token as Tokens.Heading).text.trim();
      active =
        !excluded.has(title) && (included.size === 0 || included.has(title));
    }
    if (active && token.type !== "space") selected.push(token);
  }
  return selected;
}

function renderSources(
  lesson: LessonBundle,
  context: InlineContext,
): string {
  const all = [...lesson.sources];
  for (const [url, number] of context.citations) {
    if (!all.some((source) => source.url === url)) {
      all.push({ title: `正文引用 ${number}`, url });
    }
  }
  const items = all
    .map(
      (source, index) =>
        `<li style="margin:0 0 10px;font-size:13px;line-height:1.65;color:${
          COLORS.muted
        };">${leaf(`[${index + 1}] ${source.title}`)}<br>${leaf(
          source.url,
        )}</li>`,
    )
    .join("");
  return `<section style="margin-top:34px;padding-top:18px;border-top:1px solid ${
    COLORS.line
  };"><h3 style="margin:0 0 14px;font-size:16px;color:${
    COLORS.ink
  };">${leaf("来源")}</h3><ol style="margin:0;padding-left:22px;">${items}</ol></section>`;
}

function renderArticle(
  lesson: LessonBundle,
  brief: PublicationBrief,
  selected: Token[],
  images: PreparedMedia[],
): string {
  const context: InlineContext = {
    citations: new Map(),
    images: new Map(images.map((image) => [image.href, image])),
  };
  const blocks = selected
    .map((token) => renderBlock(token, context))
    .join("");
  if (!blocks) {
    throw new KTeachError(
      "invalid-brief",
      "Publication Brief did not select any lesson sections.",
      "Add exact lesson section headings to include, or remove conflicting exclusions.",
    );
  }
  return `<section style="box-sizing:border-box;max-width:100%;margin:0 auto;padding:8px 6px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:${
    COLORS.ink
  };background:${COLORS.paper};">
  <section style="margin:0 0 28px;padding:18px 18px 16px;border-top:4px solid ${
    COLORS.accent
  };background:${COLORS.note};">
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:${
      COLORS.muted
    };">${leaf(brief.angle)}</p>
    <p style="margin:0;font-size:17px;line-height:1.8;font-weight:600;color:${
      COLORS.ink
    };">${leaf(brief.summary)}</p>
  </section>
  ${blocks}
  ${renderSources(lesson, context)}
  <section style="margin-top:30px;padding-top:16px;border-top:1px solid ${
    COLORS.line
  };"><p style="margin:0;font-size:13px;line-height:1.7;color:${
    COLORS.muted
  };">${leaf(`作者：${brief.author}`)}</p></section>
</section>
`;
}

function collectImages(tokens: Token[]): Tokens.Image[] {
  const found: Tokens.Image[] = [];
  const visit = (token: Token): void => {
    if (token.type === "image") {
      found.push(token as Tokens.Image);
      return;
    }
    if ("tokens" in token && Array.isArray(token.tokens)) {
      for (const child of token.tokens as Token[]) visit(child);
    }
  };
  for (const token of tokens) visit(token);
  return found;
}

async function prepareMedia(
  root: string,
  lessonDirectory: string,
  selected: Token[],
): Promise<PreparedMedia[]> {
  const images = collectImages(selected);
  const unique = new Map<string, Tokens.Image>();
  for (const image of images) unique.set(image.href, image);
  const prepared: PreparedMedia[] = [];
  for (const [href, image] of unique) {
    if (/^https?:/i.test(href)) {
      throw new KTeachError(
        "render-failed",
        `External article image is not uploadable: ${href}.`,
        "Download the image into the Lesson Bundle media directory and reference the local file.",
      );
    }
    const sourcePath = path.resolve(lessonDirectory, href);
    const relativeSource = path.relative(root, sourcePath);
    if (
      path.isAbsolute(relativeSource) ||
      relativeSource === ".." ||
      relativeSource.startsWith(`..${path.sep}`)
    ) {
      throw new KTeachError(
        "render-failed",
        `Article image points outside the Learning Workspace: ${href}.`,
        "Move the image into the Lesson Bundle media directory.",
      );
    }
    const index = prepared.length + 1;
    const placeholder = `KT_WECHAT_MEDIA_${String(index).padStart(3, "0")}`;
    const extension = path.extname(sourcePath).toLowerCase();
    let bytes: Buffer;
    let fileName: string;
    let kind: PreparedMedia["record"]["kind"] = "content-image";
    if (extension === ".yaml" || extension === ".yml") {
      const value = parse(await readFile(sourcePath, "utf8")) as unknown;
      const errors = await validateDocument("diagram-spec", value);
      if (errors.length > 0) {
        throw new KTeachError(
          "render-failed",
          `${href}: ${errors.join("; ")}.`,
          "Correct the Diagram Spec and render again.",
        );
      }
      const spec = value as Parameters<typeof renderDiagramSvg>[0];
      bytes = await sharp(Buffer.from(renderDiagramSvg(spec)), {
        density: 144,
      })
        .png()
        .toBuffer();
      fileName = `${spec.id}.png`;
      kind = "diagram";
    } else {
      const source = await readFile(sourcePath);
      const stem = path.basename(sourcePath, extension);
      if (extension === ".jpg" || extension === ".jpeg") {
        bytes = await sharp(source)
          .resize({ width: 1080, withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toBuffer();
        fileName = `${stem}.jpg`;
      } else {
        bytes = await sharp(source)
          .resize({ width: 1080, withoutEnlargement: true })
          .png({ compressionLevel: 9 })
          .toBuffer();
        fileName = `${stem}.png`;
      }
    }
    if (bytes.length >= 1024 * 1024) {
      throw new KTeachError(
        "render-failed",
        `${href}: derived content image exceeds the conservative 1 MB upload limit.`,
        "Resize or simplify the source image and render again.",
      );
    }
    const file = `media/${fileName}`;
    prepared.push({
      href,
      alt: image.text,
      bytes,
      record: {
        kind,
        placeholder,
        source: relativeSource.split(path.sep).join("/"),
        file,
        content_hash: createHash("sha256").update(bytes).digest("hex"),
      },
    });
  }
  return prepared;
}

function validateArticle(
  article: string,
  brief: PublicationBrief,
): { errors: string[]; warnings: string[]; eligible_for_draft: boolean } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const forbidden = [
    /<script[\s>]/i,
    /<style[\s>]/i,
    /<\/?div[\s>]/i,
    /\sclass\s*=/i,
    /\sid\s*=/i,
    /position\s*:\s*(?:fixed|absolute|sticky)/i,
    /display\s*:\s*grid/i,
    /var\s*\(\s*--/i,
    /@(?:media|keyframes|import)/i,
  ];
  if (forbidden.some((rule) => rule.test(article)))
    errors.push("article contains unsupported HTML or CSS");
  const allowedTags = new Set([
    "section",
    "p",
    "span",
    "strong",
    "em",
    "sup",
    "blockquote",
    "ol",
    "ul",
    "li",
    "h2",
    "h3",
    "img",
    "br",
  ]);
  for (const match of article.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi)) {
    if (!allowedTags.has(match[1].toLowerCase())) {
      errors.push(`unsupported tag: ${match[1].toLowerCase()}`);
    }
  }
  const withoutLeafText = article
    .replace(/<span\s+leaf="">[\s\S]*?<\/span>/gi, "")
    .replace(/<[^>]+>/g, "")
    .trim();
  if (/[\u3400-\u9fff]/.test(withoutLeafText))
    errors.push("Chinese text exists outside span leaf wrappers");
  if (/<script|javascript:/i.test(article))
    errors.push("article contains executable content");
  if (!/<span leaf="">/.test(article))
    errors.push("article text is missing span leaf wrappers");
  if (Array.from(brief.title).length > 32)
    errors.push("title exceeds 32 characters");
  if (Array.from(brief.author).length > 16)
    errors.push("author exceeds 16 characters");
  if (Array.from(brief.summary).length > 120)
    errors.push("summary exceeds 120 characters");
  if (/localhost|127\.0\.0\.1|(?:href|src)="(?:\.\/|\.\.\/)/i.test(article))
    errors.push("article contains a local or relative link");
  if (/—|–/.test(article)) warnings.push("visible copy contains a long dash");
  const plainText = article.replace(/<[^>]+>/g, "");
  if (/[\u3400-\u9fff][,;!?]/.test(plainText))
    warnings.push("Chinese copy contains half-width punctuation");
  if ((article.match(/<img\b/gi) ?? []).length > 20)
    errors.push("article contains more than 20 images");
  return { errors, warnings, eligible_for_draft: errors.length === 0 && warnings.length === 0 };
}

function wrapPreview(title: string, article: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${visibleText(title)} - 公众号预览</title>
  <style>
    body{margin:0;background:#dfe3df;color:#1c2822;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
    .toolbar{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;padding:12px 18px;background:#1c2822;color:#f5f1e8}
    button{border:1px solid #d6ddd8;border-radius:3px;padding:9px 14px;background:#f5f1e8;color:#1c2822;font-weight:700;cursor:pointer}
    main{width:min(100% - 24px,677px);margin:24px auto;background:#f5f1e8;box-shadow:0 12px 36px rgba(28,40,34,.16)}
  </style>
</head>
<body>
  <header class="toolbar"><span>仅供本地检查</span><button type="button" data-copy>复制正文</button></header>
  <main data-article>${article}</main>
  <script>
    document.querySelector("[data-copy]").addEventListener("click",async()=>{
      const article=document.querySelector("[data-article]");
      await navigator.clipboard.write([new ClipboardItem({"text/html":new Blob([article.innerHTML],{type:"text/html"}),"text/plain":new Blob([article.innerText],{type:"text/plain"})})]);
    });
  </script>
</body>
</html>`;
}

async function createCover(
  outputPath: string,
  brief: PublicationBrief,
  theme: TeachingTheme,
): Promise<Buffer> {
  const title = Array.from(brief.title);
  const first = title.slice(0, 16).join("");
  const second = title.slice(16, 32).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="383">
  <rect width="900" height="383" fill="${theme.colors.background}"/>
  <rect x="56" y="48" width="6" height="287" fill="${theme.colors.accent}"/>
  <text x="92" y="112" fill="${theme.colors.muted}" font-family="-apple-system,'PingFang SC',sans-serif" font-size="24">K TEACH · ${visibleText(theme.label)}</text>
  <text x="92" y="196" fill="${theme.colors.ink}" font-family="'Songti SC','STSong',serif" font-size="48" font-weight="700">${visibleText(
    first,
  )}</text>
  ${
    second
      ? `<text x="92" y="260" fill="${theme.colors.ink}" font-family="'Songti SC','STSong',serif" font-size="48" font-weight="700">${visibleText(
          second,
        )}</text>`
      : ""
  }
  <text x="92" y="314" fill="${theme.colors.muted}" font-family="-apple-system,'PingFang SC',sans-serif" font-size="22">${visibleText(
    brief.author,
  )}</text>
</svg>`;
  let bytes = await sharp(Buffer.from(svg)).jpeg({ quality: 76 }).toBuffer();
  if (bytes.length >= 64 * 1024)
    bytes = await sharp(Buffer.from(svg)).jpeg({ quality: 58 }).toBuffer();
  await writeFile(outputPath, bytes);
  return bytes;
}

async function prepareCover(
  root: string,
  outputPath: string,
  lesson: LessonBundle,
  brief: PublicationBrief,
  theme: TeachingTheme,
): Promise<{ bytes: Buffer; source: string; usedVisualProvider: boolean }> {
  if (brief.cover.mode === "generated") {
    return {
      bytes: await createCover(outputPath, brief, theme),
      source: `deterministic-${theme.id}-cover`,
      usedVisualProvider: false,
    };
  }
  if (!brief.cover.asset_id) {
    throw new KTeachError(
      "invalid-brief",
      "cover.asset_id is required when cover.mode is visual-asset.",
      "Select a registered cover asset or use cover.mode: generated.",
    );
  }
  const registryRoot = path.join(root, ".k-teach", "artifacts", "visuals");
  const planDirectories = await readdir(registryRoot, {
    withFileTypes: true,
  }).catch(() => []);
  const matches: Array<Record<string, unknown>> = [];
  for (const directory of planDirectories.filter((entry) => entry.isDirectory())) {
    const recordPath = path.join(
      registryRoot,
      directory.name,
      `${brief.cover.asset_id}.json`,
    );
    try {
      const record = JSON.parse(await readFile(recordPath, "utf8")) as unknown;
      const errors = await validateDocument("visual-asset-record", record);
      if (errors.length === 0) matches.push(record as Record<string, unknown>);
    } catch {
      // A different plan may not contain this asset id.
    }
  }
  const record = matches.find(
    (candidate) =>
      candidate.lesson_id === lesson.id &&
      candidate.lesson_revision === lesson.revision &&
      candidate.kind === "cover",
  );
  if (!record) {
    throw new KTeachError(
      "missing-capability",
      `Registered cover visual not found: ${brief.cover.asset_id}.`,
      "Generate, validate, and register the cover asset, or use cover.mode: generated.",
    );
  }
  const sourcePath = path.resolve(root, String(record.output_path));
  const relative = path.relative(root, sourcePath);
  if (
    path.isAbsolute(relative) ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`)
  ) {
    throw new KTeachError(
      "render-failed",
      "Registered cover points outside the Learning Workspace.",
      "Register a cover file inside the lesson media directory.",
    );
  }
  const source = await readFile(sourcePath);
  const hash = createHash("sha256").update(source).digest("hex");
  if (hash !== record.content_hash) {
    throw new KTeachError(
      "render-failed",
      "Registered cover content has changed.",
      "Validate and register the changed cover as a new asset record.",
    );
  }
  let bytes = await sharp(source)
    .resize(900, 383, { fit: "cover", position: "centre" })
    .jpeg({ quality: 76 })
    .toBuffer();
  if (bytes.length >= 64 * 1024) {
    bytes = await sharp(source)
      .resize(900, 383, { fit: "cover", position: "centre" })
      .jpeg({ quality: 58 })
      .toBuffer();
  }
  if (bytes.length >= 64 * 1024) {
    throw new KTeachError(
      "render-failed",
      "Derived cover exceeds the conservative 64 KB thumbnail limit.",
      "Use a simpler cover image or cover.mode: generated.",
    );
  }
  await writeFile(outputPath, bytes);
  return {
    bytes,
    source: `visual-asset:${brief.cover.asset_id}`,
    usedVisualProvider: true,
  };
}

export async function renderWechat(
  root: string,
  briefId: string,
  outputDirectory: string,
): Promise<string> {
  await validateLessonBundles(root);
  const briefPath = path.join(root, "publications", `${briefId}.yaml`);
  let briefSource: string;
  let briefValue: unknown;
  try {
    briefSource = await readFile(briefPath, "utf8");
    briefValue = parse(briefSource);
  } catch {
    throw new KTeachError(
      "invalid-brief",
      `Publication Brief not found or invalid: ${briefId}.`,
      `Create publications/${briefId}.yaml and run render again.`,
    );
  }
  const briefErrors = await validateDocument("publication-brief", briefValue);
  if (briefErrors.length > 0) {
    throw new KTeachError(
      "invalid-brief",
      `${briefId}: ${briefErrors.join("; ")}.`,
      "Correct the Publication Brief and render again.",
      { errors: briefErrors },
    );
  }
  const brief = briefValue as PublicationBrief;
  if (brief.id !== briefId) {
    throw new KTeachError(
      "invalid-brief",
      "Publication Brief id does not match --brief.",
      "Use the file whose id matches the requested brief.",
    );
  }
  const lessonsRoot = path.join(root, "lessons");
  const lessonDirectories = (await readdir(lessonsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(lessonsRoot, entry.name));
  let lessonDirectory: string | undefined;
  let lessonSource = "";
  let lesson: LessonBundle | undefined;
  for (const directory of lessonDirectories) {
    const source = await readFile(path.join(directory, "lesson.yaml"), "utf8");
    const value = parse(source) as LessonBundle;
    if (value.id === brief.lesson_id) {
      lessonDirectory = directory;
      lessonSource = source;
      lesson = value;
      break;
    }
  }
  if (!lessonDirectory || !lesson) {
    throw new KTeachError(
      "invalid-brief",
      `Lesson not found: ${brief.lesson_id}.`,
      "Correct lesson_id in the Publication Brief.",
    );
  }
  if (lesson.revision !== brief.lesson_revision) {
    throw new KTeachError(
      "invalid-brief",
      "Publication Brief targets a stale Lesson Bundle revision.",
      "Review the changed lesson and create a new brief revision.",
    );
  }
  const markdown = await readFile(path.join(lessonDirectory, "lesson.md"), "utf8");
  const selected = selectBlocks(markdown, brief);
  const preparedMedia = await prepareMedia(root, lessonDirectory, selected);
  const theme = resolveTeachingTheme(brief.theme);
  const article = applyWechatTheme(
    renderArticle(lesson, brief, selected, preparedMedia),
    theme,
  );
  const validation = validateArticle(article, brief);
  if (!validation.eligible_for_draft) {
    throw new KTeachError(
      "render-failed",
      `WeChat validation failed: ${[
        ...validation.errors,
        ...validation.warnings,
      ].join("; ")}.`,
      "Correct the brief or selected lesson content and render again.",
    );
  }
  const output = path.resolve(root, outputDirectory, "wechat", brief.id);
  const coverDirectory = path.join(output, "cover");
  const mediaDirectory = path.join(output, "media");
  await Promise.all([
    mkdir(coverDirectory, { recursive: true }),
    mkdir(mediaDirectory, { recursive: true }),
  ]);
  const cover = await prepareCover(
    root,
    path.join(coverDirectory, "cover.jpg"),
    lesson,
    brief,
    theme,
  );
  const inputHash = createHash("sha256")
    .update(lessonSource)
    .update(markdown)
    .update(briefSource)
    .digest("hex");
  const manifest = {
    schema_version: 1,
    id: `wechat-${brief.id}-${inputHash.slice(0, 12)}`,
    kind: "wechat-article",
    channel: "wechat",
    generator: "k-teach-wechat-v1",
    generated_at: brief.revision,
    lesson: { id: lesson.id, revision: lesson.revision },
    design_profile: { id: theme.id, revision: "1" },
    publication_brief: {
      id: brief.id,
      revision: brief.revision,
      authorized_for_publication: brief.authorized_for_publication,
    },
    article: {
      title: brief.title,
      author: brief.author,
      digest: brief.summary,
    },
    input_hash: inputHash,
    input_sources: [
      path.relative(root, path.join(lessonDirectory, "lesson.yaml")),
      path.relative(root, path.join(lessonDirectory, "lesson.md")),
      path.relative(root, briefPath),
    ],
    files: [
      "article.html",
      "preview.html",
      "cover/cover.jpg",
      ...preparedMedia.map((media) => media.record.file),
    ],
    media: [
      {
        kind: "cover",
        source: cover.source,
        file: "cover/cover.jpg",
        content_hash: createHash("sha256").update(cover.bytes).digest("hex"),
      },
      ...preparedMedia.map((media) => media.record),
    ],
    capabilities_used: [
      "lesson-bundle",
      "wechat-renderer",
      ...(preparedMedia.some((media) => media.record.kind === "diagram")
        ? ["diagram"]
        : []),
      ...(cover.usedVisualProvider ? ["visual-provider"] : []),
    ],
    warnings: [],
    validation,
    publication_eligibility:
      validation.eligible_for_draft && brief.authorized_for_publication,
  };
  const manifestErrors = await validateDocument(
    "wechat-artifact-manifest",
    manifest,
  );
  if (manifestErrors.length > 0) {
    throw new KTeachError(
      "render-failed",
      `WeChat manifest is invalid: ${manifestErrors.join("; ")}.`,
      "Correct the renderer contract and render again.",
    );
  }
  await Promise.all([
    writeFile(path.join(output, "article.html"), article, "utf8"),
    writeFile(
      path.join(output, "preview.html"),
      wrapPreview(
        brief.title,
        preparedMedia.reduce(
          (previewArticle, media) =>
            previewArticle.replaceAll(
              media.record.placeholder,
              media.record.file,
            ),
          article,
        ),
      ),
      "utf8",
    ),
    writeFile(
      path.join(output, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    ),
    ...preparedMedia.map((media) =>
      writeFile(path.join(output, media.record.file), media.bytes),
    ),
  ]);
  return output;
}
