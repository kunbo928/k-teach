import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { marked,                         } from "marked";
import { parse } from "yaml";


import { validateDocument } from "./schema.js";
import { renderDiagramSvg } from "./diagram-renderer.js";
import { KTeachError } from "./errors.js";
import {
  readExercises,
  validateLessonBundles,

} from "./lesson-bundle.js";
import {
  isTeachingThemeId,
  resolveTeachingTheme,
  TEACHING_THEME_IDS,
  TEACHING_THEMES,

} from "./teaching-themes.js";









function escapeHtml(value         )         {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function inline(tokens         , media                     )         {
  return tokens
    .map((token) => {
      if (token.type === "text") {
        const text = token               ;
        return text.tokens ? inline(text.tokens, media) : escapeHtml(text.text);
      }
      if (token.type === "strong")
        return `<strong>${inline((token                 ).tokens, media)}</strong>`;
      if (token.type === "em")
        return `<em>${inline((token             ).tokens, media)}</em>`;
      if (token.type === "codespan")
        return `<code>${escapeHtml((token                   ).text)}</code>`;
      if (token.type === "link") {
        const link = token               ;
        return `<a href="${escapeHtml(link.href)}">${inline(link.tokens, media)}</a>`;
      }
      if (token.type === "image") {
        const image = token                ;
        const source = media.get(image.href);
        return source
          ? `<figure><img src="${escapeHtml(source)}" alt="${escapeHtml(image.text)}"><figcaption>${escapeHtml(image.text)}</figcaption></figure>`
          : `<span class="media-fallback">${escapeHtml(image.text)}</span>`;
      }
      if (token.type === "br") return "<br>";
      if (token.type === "del")
        return `<del>${inline((token              ).tokens, media)}</del>`;
      return "text" in token ? escapeHtml(String(token.text)) : "";
    })
    .join("");
}

function block(token       , media                     )         {
  if (token.type === "paragraph") {
    const paragraph = token                    ;
    if (paragraph.tokens.length === 1 && paragraph.tokens[0].type === "image")
      return inline(paragraph.tokens, media);
    return `<p>${inline(paragraph.tokens, media)}</p>`;
  }
  if (token.type === "heading")
    return `<h3>${inline((token                  ).tokens, media)}</h3>`;
  if (token.type === "blockquote")
    return `<blockquote>${(token                     ).tokens
      .map((child) => block(child, media))
      .join("")}</blockquote>`;
  if (token.type === "list") {
    const list = token               ;
    const tag = list.ordered ? "ol" : "ul";
    return `<${tag}>${list.items
      .map(
        (item) =>
          `<li>${inline(marked.Lexer.lexInline(item.text)           , media)}</li>`,
      )
      .join("")}</${tag}>`;
  }
  if (token.type === "code")
    return `<pre><code>${escapeHtml((token               ).text)}</code></pre>`;
  if (token.type === "hr") return "<hr>";
  return "";
}

function sectionSlides(
  markdown        ,
  exercises            ,
  media                     ,
  brief                    ,
)          {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const tokens = marked.lexer(markdown)           ;
  const slides          = [];
  let title = "";
  let body          = [];
  const push = ()       => {
    if (!title) return;
    const ids           = [];
    const bodyHtml = body
      .map((token) => {
        if (token.type === "paragraph") {
          const match = (token                    ).text.match(
            /^\{\{exercise:([A-Za-z0-9][A-Za-z0-9_-]*)\}\}\s*$/,
          );
          if (match) {
            const exercise = byId.get(match[1]);
            if (!exercise) return "";
            ids.push(exercise.id);
            return `<section class="practice-card"><span class="practice-label">TRY THIS</span><p>${escapeHtml(exercise.prompt)}</p></section>`;
          }
        }
        return block(token, media);
      })
      .join("");
    if (brief && brief.exclude.includes(title)) return;
    if (brief && brief.include.length > 0 && !brief.include.includes(title)) return;
    const visibleExerciseIds = brief?.purpose === "talk" ? [] : ids;
    const visibleBody = brief?.purpose === "talk"
      ? bodyHtml.replace(/<section class="practice-card">[\s\S]*?<\/section>/g, "")
      : bodyHtml;
    slides.push({
      eyebrow: visibleExerciseIds.length > 0 ? "PRACTICE" : brief?.purpose === "talk" ? "KEY IDEA" : "LESSON",
      title,
      body: visibleBody,
      notes: `<p><strong>Intent:</strong> ${escapeHtml(brief?.purpose === "talk" ? "Advance the narrative with one clear claim or piece of evidence." : "Guide one clear teaching action in the learning sequence.")}</p><p><strong>Suggested delivery:</strong> Explain the visible content, pause for the audience, then connect it to the next slide.</p><p><strong>Transition:</strong> Continue from ${escapeHtml(title)} to the next step.</p><p><strong>Timing:</strong> 2–4 min</p>${visibleExerciseIds
        .map((id) => byId.get(id))
        .filter((exercise)                       => exercise !== undefined)
        .map(
          (exercise) =>
            `<p><strong>Answer:</strong> ${escapeHtml(exercise.answer)}</p><p><strong>Feedback:</strong> ${escapeHtml(exercise.feedback)}</p>`,
        )
        .join("")}${brief?.purpose === "talk" ? "<p><strong>Optional cut:</strong> Remove this slide if the central claim remains supported.</p>" : ""}`,
      layout: visibleExerciseIds.length > 0 ? "practice" : "content",
    });
  };
  for (const token of tokens) {
    if (token.type === "heading" && (token                  ).depth === 1)
      continue;
    if (token.type === "heading" && (token                  ).depth === 2) {
      push();
      title = (token                  ).text.trim();
      body = [];
    } else if (title && token.type !== "space") {
      body.push(token);
    }
  }
  push();
  return slides;
}

function collectImages(tokens         )                 {
  const images                 = [];
  const visit = (token       )       => {
    if (token.type === "image") images.push(token                );
    if ("tokens" in token && Array.isArray(token.tokens))
      for (const child of token.tokens           ) visit(child);
  };
  for (const token of tokens) visit(token);
  return images;
}

async function prepareMedia(
  root        ,
  lessonRoot        ,
  markdown        ,
)                               {
  const result = new Map                ();
  const unique = new Map(
    collectImages(marked.lexer(markdown)           ).map((image) => [
      image.href,
      image,
    ]),
  );
  if (unique.size === 0) return result;
  for (const href of unique.keys()) {
    if (/^[a-z]+:/i.test(href)) continue;
    const source = path.resolve(lessonRoot, href);
    const relative = path.relative(root, source);
    if (
      path.isAbsolute(relative) ||
      relative === ".." ||
      relative.startsWith(`..${path.sep}`)
    ) {
      throw new KTeachError(
        "render-failed",
        `Presentation image points outside the Teach: ${href}.`,
        "Move the image into the Lesson Bundle media directory.",
      );
    }
    const extension = path.extname(source).toLowerCase();
    if (extension === ".yaml" || extension === ".yml") {
      const spec = parse(await readFile(source, "utf8"))

          ;
      const svg = Buffer.from(renderDiagramSvg(spec), "utf8").toString("base64");
      result.set(href, `data:image/svg+xml;base64,${svg}`);
      continue;
    }
    const mime = ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml" }                          )[extension];
    if (!mime) throw new KTeachError("render-failed", `Unsupported presentation image: ${href}.`, "Use PNG, JPEG, GIF, WebP, SVG, or a Diagram Spec.");
    result.set(href, `data:${mime};base64,${(await readFile(source)).toString("base64")}`);
  }
  return result;
}

function themeCss()         {
  return TEACHING_THEMES.map(
    (theme) => `[data-theme="${theme.id}"]{
      --bg:${theme.colors.background};
      --surface:${theme.colors.surface};
      --ink:${theme.colors.ink};
      --muted:${theme.colors.muted};
      --line:${theme.colors.line};
      --accent:${theme.colors.accent};
      --accent-soft:${theme.colors.accentSoft};
      --code:${theme.colors.code};
      --display:${theme.display};
      --radius:${theme.radius};
    }`,
  ).join("\n");
}

function slideMarkup(slide       , index        )         {
  return `<section class="slide layout-${slide.layout}" data-slide="${index}" aria-label="Slide ${index + 1}">
    <div class="slide-chrome"><span>${escapeHtml(slide.eyebrow)}</span><span>${String(index + 1).padStart(2, "0")}</span></div>
    <div class="slide-content"><h2>${escapeHtml(slide.title)}</h2><div class="slide-body">${slide.body}</div></div>
    <aside class="notes">${slide.notes}</aside>
  </section>`;
}

function deckHtml(
  lesson              ,
  contentSlides         ,
  theme               ,
  brief                    ,
)         {
  const slides          = [
    {
      eyebrow: brief?.purpose === "talk" ? "K TEACH · TALK" : "K TEACH · TEACHING",
      title: lesson.title,
      body: `<p class="mission">${escapeHtml(lesson.mission)}</p><div class="objectives">${lesson.objectives.map((objective) => `<span>${escapeHtml(objective)}</span>`).join("")}</div>`,
      notes: `<p><strong>Intent:</strong> ${escapeHtml(brief?.purpose === "talk" ? "Open the narrative and establish the central claim." : "Make the learning outcome visible before instruction.")}</p><p><strong>Timing:</strong> 1–2 min</p><p>${escapeHtml(lesson.mission)}</p>`,
      layout: "cover",
    },
    ...contentSlides,
    {
      eyebrow: "REFERENCES",
      title: "继续探索",
      body: `<ol class="source-list">${lesson.sources.map((source) => `<li><strong>${escapeHtml(source.title)}</strong><span>${escapeHtml(source.url)}</span></li>`).join("")}</ol>`,
      notes: "",
      layout: "sources",
    },
  ];
  return `<!doctype html>
<html lang="zh-CN" data-theme="${theme.id}">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(lesson.title)} · K Teach</title>
  <style>
    :root{--sans:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif}
    ${themeCss()}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);font-family:var(--sans);color:var(--ink);overflow:hidden}.deck{width:100vw;height:100vh;display:grid;place-items:center}
    .slide{display:none;position:relative;width:min(100vw,177.78vh);aspect-ratio:16/9;overflow:hidden;background:var(--surface);padding:5.5% 6.5%;border-radius:var(--radius);box-shadow:0 24px 80px #0004}.slide.is-active{display:block;animation:enter .42s cubic-bezier(.2,.8,.2,1)}@keyframes enter{from{opacity:0;transform:translateY(14px) scale(.992)}to{opacity:1;transform:none}}.slide::after{content:"";position:absolute;right:-7%;bottom:-18%;width:35%;aspect-ratio:1;border-radius:50%;background:var(--accent-soft);opacity:.7}
    [data-theme="storybook"] .slide::before{content:"";position:absolute;inset:3% 3% auto auto;width:18%;height:11%;border-radius:50%;background:var(--accent-soft);box-shadow:-4rem 2rem 0 var(--accent-soft)}[data-theme="nature-explorer"] .slide::before{content:"✦  OBSERVE  ·  CLASSIFY  ·  DISCOVER";position:absolute;right:6%;bottom:5%;color:var(--accent);font-size:.8vw;letter-spacing:.12em}[data-theme="active-classroom"] .slide{border:3px solid var(--ink);box-shadow:10px 10px 0 var(--accent)}[data-theme="active-classroom"] .slide h2{transform:rotate(-.5deg)}[data-theme="junior-lab"] .slide{background-image:linear-gradient(#9dbbc426 1px,transparent 1px),linear-gradient(90deg,#9dbbc426 1px,transparent 1px);background-size:28px 28px}[data-theme="editorial-desk"] .slide h2{border-block:4px double var(--ink);padding-block:.18em}[data-theme="future-lab"] .slide{background-image:linear-gradient(#35d0ba12 1px,transparent 1px),linear-gradient(90deg,#35d0ba12 1px,transparent 1px);background-size:40px 40px;box-shadow:0 0 0 1px var(--accent),0 24px 80px #0008}
    .slide-chrome{position:absolute;left:6.5%;right:6.5%;top:4%;display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:.7%;font-size:clamp(9px,1vw,15px);font-weight:800;letter-spacing:.16em;color:var(--accent)}.slide-content{position:relative;z-index:1;height:100%;display:flex;flex-direction:column;justify-content:center}
    .slide h2{max-width:82%;margin:0 0 3%;font-family:var(--display);font-size:clamp(30px,5vw,76px);line-height:.98;letter-spacing:-.035em}.slide-body{max-width:88%;font-size:clamp(14px,1.55vw,25px);line-height:1.55}.slide-body p{margin:0 0 1em}.slide-body ul,.slide-body ol{display:grid;gap:.55em;margin:.4em 0;padding-left:1.3em}.slide-body li::marker{color:var(--accent);font-weight:800}.slide-body strong{color:var(--accent)}.slide-body code{padding:.08em .3em;background:var(--accent-soft);border-radius:.2em}.slide-body pre{max-height:28vh;overflow:auto;padding:1em 1.2em;background:#14221c;color:#edf5ef;border-radius:.25em;font-size:.72em}.slide-body blockquote{margin:.4em 0;padding:.8em 1em;border-left:.3em solid var(--accent);background:var(--accent-soft);font-family:var(--display);font-size:1.15em}
    figure{margin:.8em 0;display:grid;justify-items:center}figure img{display:block;max-width:100%;max-height:31vh;object-fit:contain}figcaption{margin-top:.4em;color:var(--muted);font-size:.7em}.media-fallback{display:inline-block;padding:.7em 1em;border:1px solid var(--line);color:var(--muted)}.layout-cover h2{max-width:88%;font-size:clamp(42px,7vw,110px)}.mission{max-width:65%;font-family:var(--display);font-size:1.35em}.objectives{display:flex;flex-wrap:wrap;gap:.5em}.objectives span{padding:.45em .75em;border:1px solid var(--line);background:var(--accent-soft);font-size:.75em}
    .practice-card{max-width:78%;padding:1.4em 1.5em;border-left:.45em solid var(--accent);background:var(--accent-soft)}.practice-label{font-size:.62em;font-weight:900;letter-spacing:.18em;color:var(--accent)}.practice-card p{margin:.45em 0 0;font-family:var(--display);font-size:1.35em;line-height:1.25}.source-list{list-style:none!important;padding:0!important;counter-reset:source}.source-list li{counter-increment:source;display:grid;grid-template-columns:2em 1fr;column-gap:.6em}.source-list li::before{content:counter(source,decimal-leading-zero);color:var(--accent);font-weight:900}.source-list li span{grid-column:2;color:var(--muted);font-size:.72em;overflow-wrap:anywhere}.notes{display:none}
    .progress{position:fixed;left:0;bottom:0;height:4px;background:var(--accent);transition:width .25s}.help,.theme-name{position:fixed;bottom:10px;border:1px solid var(--line);border-radius:999px;background:color-mix(in srgb,var(--surface) 88%,transparent);color:var(--muted);padding:4px 9px;font-size:12px}.help{right:12px}.theme-name{left:12px}.overview{display:none;position:fixed;inset:0;z-index:5;overflow:auto;padding:4vw;background:#09130fed;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}.overview.is-open{display:grid}.overview button{aspect-ratio:16/9;border:2px solid transparent;background:var(--surface);color:var(--ink);padding:20px;text-align:left;cursor:pointer}.overview button:hover{border-color:var(--accent)}.presenter{display:none;position:fixed;inset:0;z-index:7;background:#08110e;color:#eef5f0;padding:3vw;grid-template-columns:1fr 1fr;gap:2vw}.presenter.is-open{display:grid}.presenter-card{overflow:auto;border:1px solid #ffffff33;padding:2vw}.presenter-card h3{margin-top:0;color:#9cc9ad}.presenter button{position:absolute;right:3vw;top:2vw}
    @media print{html,body{overflow:visible;background:#fff}.deck{display:block;width:auto;height:auto}.slide{display:block!important;width:13.333in;height:7.5in;break-after:page;box-shadow:none}.progress,.help,.overview,.presenter{display:none!important}}@media(prefers-reduced-motion:reduce){.slide.is-active{animation:none}}
  </style>
</head>
<body>
  <main class="deck">${slides.map(slideMarkup).join("\n")}</main><div class="progress" aria-hidden="true"></div><div class="theme-name" data-theme-name>${escapeHtml(theme.label)}</div><div class="help">← → navigate · T theme · O overview · S presenter · F fullscreen</div><div class="overview" aria-label="Slide overview"></div>
  <section class="presenter" aria-label="Presenter mode"><button type="button">Close</button><div class="presenter-card"><h3>Current</h3><div data-current></div><p data-timer>00:00</p></div><div class="presenter-card"><h3>Next</h3><div data-next></div><h3>Notes</h3><div data-notes></div></div></section>
  <script>
    const slides=[...document.querySelectorAll(".slide")],progress=document.querySelector(".progress"),overview=document.querySelector(".overview"),presenter=document.querySelector(".presenter"),themeName=document.querySelector("[data-theme-name]"),themes=${JSON.stringify(TEACHING_THEMES.map(({ id, label }) => ({ id, label })))};let current=Math.max(0,Math.min(slides.length-1,Number(location.hash.slice(1)||1)-1)),started=Date.now();
    function show(index){current=Math.max(0,Math.min(slides.length-1,index));slides.forEach((slide,i)=>slide.classList.toggle("is-active",i===current));progress.style.width=((current+1)/slides.length*100)+"%";if(location.hash!==("#"+(current+1)))history.replaceState(null,"","#"+(current+1));renderPresenter()}
    slides.forEach((slide,i)=>{const button=document.createElement("button");button.innerHTML="<strong>"+String(i+1).padStart(2,"0")+"</strong><p>"+slide.querySelector("h2").textContent+"</p>";button.onclick=()=>{overview.classList.remove("is-open");show(i)};overview.append(button)});
    function renderPresenter(){presenter.querySelector("[data-current]").textContent=slides[current]?.querySelector("h2")?.textContent||"";presenter.querySelector("[data-next]").textContent=slides[current+1]?.querySelector("h2")?.textContent||"End";presenter.querySelector("[data-notes]").innerHTML=slides[current]?.querySelector(".notes")?.innerHTML||"<p>No notes.</p>"}
    function cycleTheme(){const index=themes.findIndex(theme=>theme.id===document.documentElement.dataset.theme),next=themes[(index+1)%themes.length];document.documentElement.dataset.theme=next.id;themeName.textContent=next.label}
    setInterval(()=>{const seconds=Math.floor((Date.now()-started)/1000),timer=presenter.querySelector("[data-timer]");timer.textContent=String(Math.floor(seconds/60)).padStart(2,"0")+":"+String(seconds%60).padStart(2,"0")},1000);document.addEventListener("keydown",event=>{if(["ArrowRight","PageDown"," "].includes(event.key)){event.preventDefault();show(current+1)}if(["ArrowLeft","PageUp"].includes(event.key)){event.preventDefault();show(current-1)}if(event.key==="Home")show(0);if(event.key==="End")show(slides.length-1);if(event.key.toLowerCase()==="t")cycleTheme();if(event.key.toLowerCase()==="o")overview.classList.toggle("is-open");if(event.key.toLowerCase()==="s")presenter.classList.toggle("is-open");if(event.key.toLowerCase()==="f")document.documentElement.requestFullscreen?.()});presenter.querySelector("button").onclick=()=>presenter.classList.remove("is-open");window.addEventListener("hashchange",()=>show(Number(location.hash.slice(1)||1)-1));if(new URLSearchParams(location.search).has("presenter"))presenter.classList.add("is-open");show(current);
  </script>
</body></html>`;
}

export async function renderPpt(
  root        ,
  lessonId        ,
  outputDirectory        ,
  requestedTheme         ,
  brief                    ,
)                  {
  await validateLessonBundles(root);
  const lessonDirectories = (await readdir(path.join(root, "lessons"), {
    withFileTypes: true,
  }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, "lessons", entry.name));
  let lessonRoot                    ;
  let lessonSource = "";
  let lesson                          ;
  for (const directory of lessonDirectories) {
    const source = await readFile(path.join(directory, "lesson.yaml"), "utf8");
    const value = parse(source)                ;
    if (value.id === lessonId || path.basename(directory) === lessonId) {
      lessonRoot = directory;
      lessonSource = source;
      lesson = value;
      break;
    }
  }
  if (!lessonRoot || !lesson) {
    throw new KTeachError(
      "render-failed",
      `Lesson not found: ${lessonId}.`,
      "Pass the Lesson Bundle id or directory name with --lesson.",
    );
  }
  const teach = parse(
    await readFile(path.join(root, "teach.yaml"), "utf8").catch(() => "{}"),
  )                               ;
  if (requestedTheme !== undefined && !isTeachingThemeId(requestedTheme)) {
    throw new KTeachError(
      "validation-failed",
      `Unknown Teaching Theme: ${requestedTheme}.`,
      `Use one of: ${TEACHING_THEME_IDS.join(", ")}.`,
    );
  }
  const theme = resolveTeachingTheme(
    brief?.theme.id ?? requestedTheme ??
      (isTeachingThemeId(teach.theme_default)
        ? teach.theme_default
        : "classic-manual"),
  );
  const markdown = await readFile(path.join(lessonRoot, "lesson.md"), "utf8");
  const exercises = await readExercises(
    path.join(lessonRoot, "exercises"),
    lesson.id,
  );
  if (brief && brief.lesson_revision !== lesson.revision) throw new KTeachError("invalid-brief", "Presentation Brief targets a stale Lesson Bundle revision.", "Review the changed Lesson Bundle and create a new Presentation Brief revision.");
  const output = path.resolve(root, outputDirectory, "ppt", brief?.id ?? lesson.id);
  await mkdir(output, { recursive: true });
  const media = await prepareMedia(root, lessonRoot, markdown);
  const contentSlides = sectionSlides(markdown, exercises, media, brief);
  if (contentSlides.length === 0) {
    throw new KTeachError(
      "render-failed",
      "The Lesson Bundle has no level-two sections for presentation slides.",
      "Add at least one ## section to lesson.md.",
    );
  }
  const inputHash = createHash("sha256")
    .update(lessonSource)
    .update(markdown)
    .update(JSON.stringify(exercises))
    .update(brief ? JSON.stringify(brief) : "legacy-ppt")
    .digest("hex");
  const manifest = {
    schema_version: 1,
    id: `ppt-${lesson.id}-${inputHash.slice(0, 12)}`,
    lesson_id: lesson.id,
    lesson_revision: lesson.revision,
    design_profile_revision: `ppt-v2:${theme.id}`,
    channel: "ppt",
    input_hash: inputHash,
    files: ["index.html", "manifest.json"],
    capabilities_used: [
      "presentation-renderer",
      "presenter-mode",
      "speaker-notes",
      `purpose:${brief?.purpose ?? "teaching"}`,
      `theme:${theme.id}`,
    ],
    warnings: [],
  };
  await Promise.all([
    writeFile(
      path.join(output, "index.html"),
      deckHtml(lesson, contentSlides, theme, brief),
    ),
    writeFile(
      path.join(output, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    ),
  ]);
  return output;
}

export async function renderPptFromBrief(root        , briefId        , outputDirectory        )                  {
  const sourcePath = path.join(root, "presentations", `${briefId}.yaml`);
  let value         ;
  try { value = parse(await readFile(sourcePath, "utf8")); } catch {
    throw new KTeachError("invalid-brief", `Presentation Brief not found or invalid: ${briefId}.`, `Create presentations/${briefId}.yaml and render again.`);
  }
  const errors = await validateDocument("presentation-brief", value);
  if (errors.length > 0) throw new KTeachError("invalid-brief", `${briefId}: ${errors.join("; ")}.`, "Correct the Presentation Brief and render again.");
  const brief = value                     ;
  if (brief.id !== briefId) throw new KTeachError("invalid-brief", "Presentation Brief id does not match --brief.", "Use the file whose id matches the requested brief.");
  return renderPpt(root, brief.lesson_id, outputDirectory, undefined, brief);
}


//# sourceURL=k-teach/src/ppt-renderer.ts