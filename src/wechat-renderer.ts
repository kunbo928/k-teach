import { createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import { marked, type Token, type Tokens } from "marked";
import sharp from "sharp";
import { parse } from "yaml";

import type { ChannelThemeId, LessonBundle, PublicationBrief, PublicationBriefV1 } from "./domain.ts";
import { migratePublicationBrief } from "./contract-migrations.ts";
import { renderDiagramSvg } from "./diagram-renderer.ts";
import {
  resolveEmbeddedAssets,
  type EmbeddedAsset,
} from "./embedded-assets.ts";
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
  embeddedAssets: Map<string, PreparedMedia>;
}

interface PreparedMedia {
  href: string;
  alt: string;
  bytes: Buffer;
  diagramKind?: "flow" | "relationship" | "state" | "sequence";
  record: {
    kind: "content-image" | "diagram" | "visual-asset";
    placeholder: string;
    source: string;
    file: string;
    content_hash: string;
  };
}

function resolvePreviewMedia(
  article: string,
  media: PreparedMedia[],
  relativePrefix = "",
): string {
  return media.reduce(
    (previewArticle, item) =>
      previewArticle.replaceAll(
        item.record.placeholder,
        `${relativePrefix}${item.record.file}`,
      ),
    article,
  );
}

async function normalizeWechatDiagram(bytes: Buffer): Promise<Buffer> {
  const rendered = await sharp(bytes)
    .flatten({ background: "#F6F1E7" })
    .resize({ width: 1080, height: 1800, fit: "inside", withoutEnlargement: false })
    .png({ compressionLevel: 9 })
    .toBuffer({ resolveWithObject: true });
  const targetHeight = Math.max(480, Math.min(1800, rendered.info.height));
  const horizontal = Math.max(0, 1080 - rendered.info.width);
  const vertical = Math.max(0, targetHeight - rendered.info.height);
  return sharp(rendered.data)
    .extend({
      left: Math.floor(horizontal / 2),
      right: Math.ceil(horizontal / 2),
      top: Math.floor(vertical / 2),
      bottom: Math.ceil(vertical / 2),
      background: "#F6F1E7",
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
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

const SYNTAX_COLORS = {
  key: "#7DD3FC",
  string: "#86EFAC",
  number: "#FDE68A",
  keyword: "#C4B5FD",
  comment: "#94A3B8",
};

function formatCode(source: string, language: string): string {
  if (language !== "json") return source;
  try {
    return JSON.stringify(JSON.parse(source), null, 2);
  } catch {
    return source;
  }
}

function highlightCodeLine(line: string, language: string): string {
  const jsonPattern = /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|-?\b\d+(?:\.\d+)?\b|\b(?:true|false|null)\b/g;
  const codePattern = /#[^\n]*|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b(?:def|return|if|else|elif|for|while|in|import|from|as|try|except|class|async|await|const|let|var|function|new|true|false|null|None|True|False)\b/g;
  const pattern = language === "json" ? jsonPattern : codePattern;
  let cursor = 0;
  let output = "";
  for (const match of line.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) output += leaf(line.slice(cursor, index));
    const token = match[0];
    const kind = language === "json"
      ? (match[1] ? "key" : match[2] ? "string" : /^(?:true|false|null)$/.test(token) ? "keyword" : "number")
      : (/^(?:#|\/\/)/.test(token) ? "comment" : /^(?:"|')/.test(token) ? "string" : /^\d/.test(token) ? "number" : "keyword");
    output += `<span data-syntax-token="${kind}" style="color:${SYNTAX_COLORS[kind]};">${leaf(token)}</span>`;
    cursor = index + token.length;
  }
  if (cursor < line.length) output += leaf(line.slice(cursor));
  return output || leaf(" ");
}

function renderBlock(token: Token, context: InlineContext): string {
  if (token.type === "heading") {
    const heading = token as Tokens.Heading;
    const size = heading.depth === 2 ? "20px" : "17px";
    return `<section data-wechat-component="chapter-heading" style="margin:40px 0 20px;padding-left:12px;border-left:3px solid ${
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
    const assetMatch = /^\{\{asset:([A-Za-z0-9][A-Za-z0-9_-]*)\}\}\s*$/.exec(paragraph.text);
    if (assetMatch) {
      const media = context.embeddedAssets.get(assetMatch[1]);
      if (!media) return "";
      return `<section data-embedded-asset="${visibleText(assetMatch[1])}"${media.diagramKind ? ` data-diagram-kind="${media.diagramKind}"` : ""} style="margin:26px 0;padding:10px;border:1px solid ${COLORS.line};border-radius:12px;background:#F6F1E7;"><img src="${media.record.placeholder}" alt="${visibleText(media.alt)}" style="max-width:100%;height:auto;display:block;margin:0 auto;border-radius:8px;"><p style="margin:9px 4px 2px;text-align:center;font-size:12px;line-height:1.6;color:${COLORS.muted};">${leaf(media.alt)}</p></section>`;
    }
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
    const language = (code.lang ?? "text").trim().toLowerCase().split(/\s+/)[0] || "text";
    const lines = formatCode(code.text, language)
      .split("\n")
      .map(
        (line) =>
          `<p style="margin:0;min-height:1.65em;line-height:1.65;white-space:pre-wrap;">${highlightCodeLine(line, language)}</p>`,
      )
      .join("");
    return `<section data-code-language="${visibleText(language)}" style="margin:22px 0;border-radius:8px;overflow:hidden;background:#202B26;color:#E8ECE9;font-family:Menlo,Consolas,monospace;font-size:13px;"><p style="margin:0;padding:7px 14px;border-bottom:1px solid rgba(255,255,255,.12);font-size:10px;line-height:1.4;letter-spacing:1.5px;color:#94A3B8;">${leaf(language.toUpperCase())}</p><section style="padding:14px 16px;overflow-wrap:anywhere;">${lines}</section></section>`;
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
  const sanitized: Token[] = [];
  let section: Token[] = [];
  const flush = () => {
    if (section.length === 0) return;
    const [heading, ...body] = section;
    const publicBody = body.filter((token) => !(
      token.type === "paragraph" &&
      /^\{\{exercise:[A-Za-z0-9][A-Za-z0-9_-]*\}\}\s*$/.test((token as Tokens.Paragraph).text)
    ));
    if (publicBody.length > 0) sanitized.push(heading, ...publicBody);
    section = [];
  };
  for (const token of selected) {
    if (token.type === "heading" && (token as Tokens.Heading).depth === 2) flush();
    section.push(token);
  }
  flush();
  return sanitized;
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
    embeddedAssets: new Map(images.filter((image) => image.href.startsWith("asset:")).map((image) => [image.href.slice(6), image])),
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
  const chapters = selected
    .filter((token): token is Tokens.Heading => token.type === "heading" && (token as Tokens.Heading).depth === 2)
    .map((heading, index) => ({ index: index + 1, title: heading.text.trim() }));
  const toc = chapters.length > 0
    ? `<section data-wechat-component="toc-editorial" style="margin:0 20px 34px;padding:18px 18px 8px;border-top:1px solid ${COLORS.line};border-bottom:1px solid ${COLORS.line};background:#FFFFFF;"><p style="margin:0 0 13px;font-size:10px;font-weight:700;letter-spacing:2.5px;color:${COLORS.muted};">${leaf("CONTENTS · 本文目录")}</p>${chapters.map((chapter) => `<section style="display:flex;align-items:flex-start;gap:14px;padding:11px 0;border-top:1px solid ${COLORS.line};"><p style="flex:0 0 42px;margin:0;font-size:20px;line-height:1;font-weight:900;letter-spacing:-1px;color:${COLORS.accent};">${leaf(String(chapter.index).padStart(2, "0"))}</p><p style="flex:1;margin:0;font-size:14px;line-height:1.55;font-weight:750;color:${COLORS.ink};">${leaf(chapter.title)}</p></section>`).join("")}</section>`
    : "";
  return `<section style="box-sizing:border-box;max-width:677px;margin:0 auto;padding:0 0 24px;overflow-x:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:${
    COLORS.ink
  };background:#FFFFFF;line-height:1.75;letter-spacing:.3px;">
  <section data-wechat-component="cover-breaking" style="margin:0 0 32px;border:1.5px solid ${COLORS.line};border-radius:20px;overflow:hidden;background:#FFFFFF;box-shadow:0 4px 20px rgba(0,0,0,.06);">
    <section style="padding:30px 26px 26px;">
      <p style="margin:0 0 24px;font-size:11px;font-weight:700;letter-spacing:3px;color:${COLORS.accent};">${leaf(`K TEACH · ${brief.article_type.toUpperCase()}`)}</p>
      <p style="margin:0 0 14px;font-size:25px;line-height:1.18;font-weight:900;letter-spacing:-1px;color:${COLORS.ink};">${leaf(brief.title)}</p>
      <section style="width:52px;height:3px;margin:0 0 12px;border-radius:2px;background:linear-gradient(to right,${COLORS.accent},#34D399);"></section>
      <p style="margin:0;font-size:13px;line-height:1.7;color:${COLORS.muted};">${leaf(brief.angle)}</p>
    </section>
    <section style="padding:11px 26px;background:linear-gradient(135deg,${COLORS.accent},#10B981);"><p style="margin:0;font-size:12px;font-weight:600;color:#FFFFFF;">${leaf(brief.author)}</p></section>
  </section>
  ${toc}
  <section data-wechat-component="content-card" style="margin:0 20px 30px;padding:15px 17px;border:1px dashed ${
    COLORS.accent
  };border-radius:10px;background:${COLORS.note};text-align:center;">
    <p style="margin:0;font-size:15px;line-height:1.7;font-weight:700;color:${
      COLORS.ink
    };">${leaf(brief.summary)}</p>
  </section>
  <section style="padding:0 20px;">${blocks}
  ${renderSources(lesson, context)}</section>
  <section data-wechat-component="article-signature" style="margin:32px 20px 0;padding:18px 0 0;border-top:1px solid ${
    COLORS.line
  };text-align:center;"><p style="margin:0 0 4px;font-size:13px;line-height:1.7;font-weight:700;color:${
    COLORS.ink
  };">${leaf(brief.author)}</p><p style="margin:0;font-size:11px;letter-spacing:2px;color:${
    COLORS.muted
  };">${leaf("K TEACH · 持续学习与分享")}</p></section>
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
    let diagramKind: PreparedMedia["diagramKind"];
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
      diagramKind = spec.kind;
      bytes = await sharp(Buffer.from(renderDiagramSvg(spec)), {
        density: 144,
      })
        .png()
        .toBuffer();
      bytes = await normalizeWechatDiagram(bytes);
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
      ...(diagramKind ? { diagramKind } : {}),
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

async function prepareEmbeddedMedia(
  root: string,
  lessonDirectory: string,
  selected: Token[],
  assets: Map<string, EmbeddedAsset>,
  startIndex: number,
): Promise<PreparedMedia[]> {
  const ids = selected.flatMap((token) => {
    if (token.type !== "paragraph") return [];
    const match = /^\{\{asset:([A-Za-z0-9][A-Za-z0-9_-]*)\}\}\s*$/.exec((token as Tokens.Paragraph).text);
    return match ? [match[1]] : [];
  });
  const prepared: PreparedMedia[] = [];
  for (const id of ids) {
    const asset = assets.get(id);
    if (!asset) continue;
    if (asset.kind === "interactive" || asset.kind === "audio") {
      throw new KTeachError(
        "render-failed",
        `Embedded asset ${id} (${asset.kind}) cannot be published as a static WeChat image.`,
        "Provide a diagram or illustration fallback for the selected public section.",
      );
    }
    const sourcePath = path.resolve(lessonDirectory, asset.source);
    const extension = path.extname(sourcePath).toLowerCase();
    let bytes: Buffer;
    let fileName: string;
    let diagramKind: PreparedMedia["diagramKind"];
    if (asset.kind === "diagram" || extension === ".yaml" || extension === ".yml") {
      const spec = parse(await readFile(sourcePath, "utf8")) as Parameters<typeof renderDiagramSvg>[0];
      diagramKind = spec.kind;
      bytes = await sharp(Buffer.from(renderDiagramSvg(spec)), { density: 144 }).png().toBuffer();
      bytes = await normalizeWechatDiagram(bytes);
      fileName = `${id}.png`;
    } else {
      const source = await readFile(sourcePath);
      bytes = extension === ".jpg" || extension === ".jpeg"
        ? await sharp(source).resize({ width: 1080, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()
        : await sharp(source).resize({ width: 1080, withoutEnlargement: true }).png({ compressionLevel: 9 }).toBuffer();
      fileName = `${id}${extension === ".jpg" || extension === ".jpeg" ? ".jpg" : ".png"}`;
    }
    const placeholder = `KT_WECHAT_MEDIA_${String(startIndex + prepared.length + 1).padStart(3, "0")}`;
    prepared.push({
      href: `asset:${id}`,
      alt: `${asset.title}：${asset.description}`,
      bytes,
      ...(diagramKind ? { diagramKind } : {}),
      record: {
        kind: asset.kind === "diagram" ? "diagram" : "visual-asset",
        placeholder,
        source: path.relative(root, sourcePath).split(path.sep).join("/"),
        file: `media/${fileName}`,
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

const CHANNEL_THEMES: Array<{ id: ChannelThemeId; label: string; reason: string }> = [
  { id: "emerald-editorial", label: "墨绿编辑部", reason: "强调章节秩序、关键词和沉稳阅读感" },
  { id: "graphite-minimal", label: "石墨极简", reason: "适合分析型文章，以留白和细线建立信息层级" },
  { id: "olive-journal", label: "橄榄手记", reason: "适合叙事和复盘，以温暖纸感承载长文" },
];

function teachingThemeForChannel(id: ChannelThemeId): TeachingTheme {
  return resolveTeachingTheme(id === "graphite-minimal" ? "editorial-desk" : id === "olive-journal" ? "nature-explorer" : "classic-manual");
}

function applyChannelRecipe(article: string, brief: PublicationBrief): string {
  const theme = teachingThemeForChannel(brief.channel_theme);
  const marker = brief.channel_theme === "emerald-editorial"
    ? `<section style="margin:0 20px 18px;padding:0 0 10px;border-bottom:1px solid ${theme.colors.line};"><p style="margin:0;font-size:12px;letter-spacing:2px;color:${theme.colors.accent};">${leaf(`精选导读 · ${brief.article_type.toUpperCase()}`)}</p></section>`
    : brief.channel_theme === "graphite-minimal"
      ? `<section style="margin:0 0 24px;padding:8px 0;border-top:1px solid ${theme.colors.ink};border-bottom:1px solid ${theme.colors.ink};"><p style="margin:0;text-align:center;font-size:11px;letter-spacing:3px;color:${theme.colors.muted};">${leaf(`FIELD NOTE · ${brief.article_type.toUpperCase()}`)}</p></section>`
      : `<section style="margin:0 0 22px;padding:13px 15px;border-left:5px solid ${theme.colors.accent};background:${theme.colors.accentSoft};"><p style="margin:0;font-size:13px;letter-spacing:1px;color:${theme.colors.ink};">${leaf(`阅读手记 · ${brief.article_type.toUpperCase()}`)}</p></section>`;
  let result = article.replace(
    /(<section style="box-sizing:border-box;max-width:[^;]+;[^>]+>)/,
    `$1\n  ${marker}`,
  );
  if (brief.channel_theme === "graphite-minimal") {
    result = result.replaceAll(
      `padding-left:12px;border-left:3px solid ${theme.colors.accent}`,
      `padding:0 0 10px;border-bottom:1px solid ${theme.colors.ink}`,
    );
  } else if (brief.channel_theme === "olive-journal") {
    result = result.replaceAll(
      `padding-left:12px;border-left:3px solid ${theme.colors.accent}`,
      `padding:10px 12px;border-left:3px solid ${theme.colors.accent};background:${theme.colors.accentSoft}`,
    );
  }
  return result;
}

function wrapProposalPreview(title: string, articles: Record<ChannelThemeId, string>, selected: ChannelThemeId): string {
  const panels = CHANNEL_THEMES.map((theme) => `<article data-proposal="${theme.id}"${theme.id === selected ? " data-selected" : ""}><header><strong>${visibleText(theme.label)}</strong><span>${visibleText(theme.reason)}</span></header><main data-article>${articles[theme.id]}</main></article>`).join("");
  const buttons = CHANNEL_THEMES.map((theme) => `<button type="button" data-theme="${theme.id}"${theme.id === selected ? " aria-pressed=\"true\"" : ""}>${visibleText(theme.label)}</button>`).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${visibleText(title)} · 主题方案</title><style>
  *{box-sizing:border-box}body{margin:0;background:#111915;color:#eef4ef;font:14px/1.6 system-ui,sans-serif}.shell{min-height:100vh}.toolbar{position:sticky;top:0;z-index:4;display:flex;gap:8px;align-items:center;padding:12px 18px;background:#111915eF;border-bottom:1px solid #ffffff24}.toolbar button{padding:8px 12px;border:1px solid #ffffff38;background:transparent;color:inherit;cursor:pointer}.toolbar button[aria-pressed="true"]{background:#e7eee8;color:#193c2d}.toolbar [data-mode]{margin-left:auto}.stage{padding:28px}.stage article{display:none}.stage article[data-selected]{display:block}.stage article>header{width:min(100%,677px);margin:0 auto 12px;display:grid}.stage article>header span{color:#a9b8ae}.stage main{width:min(100%,677px);margin:auto;background:#f5f1e8;box-shadow:0 18px 60px #0008}.stage.compare{display:grid;grid-template-columns:repeat(3,minmax(360px,1fr));gap:20px;overflow:auto}.stage.compare article{display:block}.stage.compare article main{width:100%}.stage.compare article>header{width:100%}.copy{position:fixed;right:18px;bottom:18px;padding:11px 16px;border:0;background:#d6e6da;color:#173d2d;font-weight:700}
  @media(max-width:720px){.toolbar{position:fixed;inset:auto 0 0;overflow:auto}.toolbar [data-mode]{display:none}.stage{padding:16px 12px 84px}.stage.compare{display:block}.stage.compare article:not([data-selected]){display:none}.copy{right:12px;bottom:64px}}
  </style></head><body><section class="shell"><nav class="toolbar">${buttons}<button type="button" data-mode>并排比较</button></nav><section class="stage">${panels}</section><button class="copy" type="button" data-copy>复制当前正文</button></section><script>
  const stage=document.querySelector(".stage"),buttons=[...document.querySelectorAll("[data-theme]")],articles=[...document.querySelectorAll("[data-proposal]")];let selected=${JSON.stringify(selected)};function choose(id){selected=id;buttons.forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.theme===id)));articles.forEach(article=>article.toggleAttribute("data-selected",article.dataset.proposal===id))}buttons.forEach(button=>button.onclick=()=>choose(button.dataset.theme));document.querySelector("[data-mode]").onclick=()=>stage.classList.toggle("compare");document.querySelector("[data-copy]").onclick=async()=>{const article=document.querySelector('[data-proposal="'+selected+'"] [data-article]');await navigator.clipboard.write([new ClipboardItem({"text/html":new Blob([article.innerHTML],{type:"text/html"}),"text/plain":new Blob([article.innerText],{type:"text/plain"})})])};choose(selected);
  </script></body></html>`;
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
  options: { proposals?: boolean } = {},
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
  const brief = migratePublicationBrief(
    briefValue as PublicationBrief | PublicationBriefV1,
  );
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
  const markdownMedia = await prepareMedia(root, lessonDirectory, selected);
  const embedded = await resolveEmbeddedAssets(lessonDirectory, lesson, markdown);
  const embeddedMedia = await prepareEmbeddedMedia(root, lessonDirectory, selected, embedded.assets, markdownMedia.length);
  const preparedMedia = [...markdownMedia, ...embeddedMedia];
  const theme = teachingThemeForChannel(brief.channel_theme);
  const article = applyChannelRecipe(applyWechatTheme(
    renderArticle(lesson, brief, selected, preparedMedia),
    theme,
  ), brief);
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
    schema_version: 2,
    id: `wechat-${brief.id}-${inputHash.slice(0, 12)}`,
    kind: "wechat-article",
    channel: "wechat",
    generator: "k-teach-wechat-v2",
    generated_at: brief.revision,
    lesson: { id: lesson.id, revision: lesson.revision },
    design_profile: { id: theme.id, revision: "1" },
    publication_brief: {
      id: brief.id,
      revision: brief.revision,
      ...(brief.draft_delivery ? { draft_delivery: brief.draft_delivery } : {}),
      authorized_for_publication: brief.authorized_for_publication,
    },
    channel_theme: brief.channel_theme,
    article_type: brief.article_type,
    artifact_revision: inputHash,
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
      ...(options.proposals ? ["proposals.html", ...CHANNEL_THEMES.map((item) => `proposals/${item.id}.html`)] : []),
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
    eligible_for_draft: validation.eligible_for_draft,
    eligible_for_publication:
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
  const proposalArticles = options.proposals ? Object.fromEntries(CHANNEL_THEMES.map((item) => [
    item.id,
    applyChannelRecipe(applyWechatTheme(renderArticle(lesson, { ...brief, channel_theme: item.id }, selected, preparedMedia), teachingThemeForChannel(item.id)), { ...brief, channel_theme: item.id }),
  ])) as Record<ChannelThemeId, string> : undefined;
  if (options.proposals) {
    for (const [id, candidate] of Object.entries(proposalArticles as Record<ChannelThemeId, string>)) {
      const candidateValidation = validateArticle(candidate, brief);
      if (!candidateValidation.eligible_for_draft) throw new KTeachError("render-failed", `Channel Theme proposal ${id} failed validation.`, "Correct the independent Channel Theme renderer before previewing proposals.");
    }
    await mkdir(path.join(output, "proposals"), { recursive: true });
  } else {
    await Promise.all([
      rm(path.join(output, "proposals.html"), { force: true }),
      rm(path.join(output, "proposals"), { recursive: true, force: true }),
    ]);
  }
  await Promise.all([
    writeFile(path.join(output, "article.html"), article, "utf8"),
    writeFile(
      path.join(output, "preview.html"),
      wrapPreview(
        brief.title,
        resolvePreviewMedia(article, preparedMedia),
      ),
      "utf8",
    ),
    ...(options.proposals ? [
      writeFile(
        path.join(output, "proposals.html"),
        wrapProposalPreview(
          brief.title,
          Object.fromEntries(
            Object.entries(proposalArticles as Record<ChannelThemeId, string>)
              .map(([id, candidate]) => [id, resolvePreviewMedia(candidate, preparedMedia)]),
          ) as Record<ChannelThemeId, string>,
          brief.channel_theme,
        ),
        "utf8",
      ),
      ...Object.entries(proposalArticles as Record<ChannelThemeId, string>).map(([id, candidate]) =>
        writeFile(
          path.join(output, "proposals", `${id}.html`),
          resolvePreviewMedia(candidate, preparedMedia, "../"),
          "utf8",
        )),
    ] : []),
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

export async function renderWechatProposals(root: string, briefId: string, outputDirectory: string): Promise<string> {
  return renderWechat(root, briefId, outputDirectory, { proposals: true });
}
