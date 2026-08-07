

/** Baseline palette baked into WeChat Article HTML before Channel Theme mapping. */
export const WECHAT_ARTICLE_BASELINE = {
  paper: "#F5F1E8",
  ink: "#1C2822",
  muted: "#66716B",
  line: "#BBC3BD",
  accent: "#315C49",
  note: "#E7E8DE",
}         ;



















export const CHANNEL_THEME_IDS = [
  "emerald-editorial",
  "graphite-minimal",
  "olive-journal",
]         ;

export const CHANNEL_THEMES                          = [
  {
    id: "emerald-editorial",
    label: "墨绿编辑部",
    reason: "强调章节秩序、关键词和沉稳阅读感",
    colors: {
      background: "#F2F0E8",
      ink: "#17231D",
      muted: "#5F6A63",
      line: "#B8BEB7",
      accent: "#315F49",
      accentSoft: "#E0E8E2",
    },
    radius: "2px",
    pattern: "rule",
  },
  {
    id: "graphite-minimal",
    label: "石墨极简",
    reason: "适合分析型文章，以留白和细线建立信息层级",
    colors: {
      background: "#F4F1EA",
      ink: "#181818",
      muted: "#606060",
      line: "#AAA59B",
      accent: "#A52A2A",
      accentSoft: "#EEDDD6",
    },
    radius: "0px",
    pattern: "columns",
  },
  {
    id: "olive-journal",
    label: "橄榄手记",
    reason: "适合叙事和复盘，以温暖纸感承载长文",
    colors: {
      background: "#F1F4E8",
      ink: "#24382C",
      muted: "#617061",
      line: "#B8C8AE",
      accent: "#4C7A4A",
      accentSoft: "#DDE9C9",
    },
    radius: "14px",
    pattern: "soft-bar",
  },
];

export function isChannelThemeId(value         )                          {
  return (
    typeof value === "string" &&
    (CHANNEL_THEME_IDS                     ).includes(value)
  );
}

export function resolveChannelTheme(value         )               {
  if (isChannelThemeId(value)) {
    const theme = CHANNEL_THEMES.find((item) => item.id === value);
    if (theme) return theme;
  }
  return CHANNEL_THEMES[0];
}

function escapeHtml(value         )         {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function visibleText(value         )         {
  return escapeHtml(String(value).replaceAll("—", "-").replaceAll("–", "-"));
}

function leaf(value         )         {
  return `<span leaf="">${visibleText(value)}</span>`;
}

function clipboardRuntime(articleExpression        )         {
  return `document.querySelector("[data-copy]").addEventListener("click",async()=>{const button=document.querySelector("[data-copy]"),article=${articleExpression},text=article.innerText,html=article.innerHTML;button.dataset.copyState="pending";async function fallback(){if(navigator.clipboard&&typeof navigator.clipboard.writeText==="function"){await navigator.clipboard.writeText(text);return}const area=document.createElement("textarea");area.value=text;area.setAttribute("readonly","");area.style.position="fixed";area.style.opacity="0";document.body.appendChild(area);area.select();const copied=document.execCommand("copy");area.remove();if(!copied)throw new Error("copy-unavailable")}try{if(navigator.clipboard&&typeof navigator.clipboard.write==="function"&&typeof ClipboardItem==="function")await navigator.clipboard.write([new ClipboardItem({"text/html":new Blob([html],{type:"text/html"}),"text/plain":new Blob([text],{type:"text/plain"})})]);else await fallback();button.dataset.copyState="success";button.textContent="已复制"}catch(error){try{await fallback();button.dataset.copyState="success";button.textContent="已复制"}catch(fallbackError){button.dataset.copyState="failed";button.textContent="复制失败";button.title="浏览器未授权剪贴板，请手动选择正文复制"}}});`;
}

/** Map baseline WeChat Article colors onto a Channel Theme palette. */
export function applyChannelTheme(
  article        ,
  theme              ,
)         {
  const replacements                          = [
    [WECHAT_ARTICLE_BASELINE.paper, theme.colors.background],
    [WECHAT_ARTICLE_BASELINE.ink, theme.colors.ink],
    [WECHAT_ARTICLE_BASELINE.muted, theme.colors.muted],
    [WECHAT_ARTICLE_BASELINE.line, theme.colors.line],
    [WECHAT_ARTICLE_BASELINE.accent, theme.colors.accent],
    [WECHAT_ARTICLE_BASELINE.note, theme.colors.accentSoft],
  ];
  let themed = article;
  for (const [source, target] of replacements)
    themed = themed.replaceAll(source, target);
  const border =
    theme.pattern === "columns"
      ? `border-top:4px double ${theme.colors.ink}`
      : `border-top:4px solid ${theme.colors.accent}`;
  return themed
    .replace(`border-top:4px solid ${theme.colors.accent}`, border)
    .replace(
      "box-sizing:border-box;max-width:100%;",
      `box-sizing:border-box;max-width:100%;border-radius:${theme.radius};`,
    );
}

export function applyChannelRecipe(
  article        ,
  brief                  ,
)         {
  const theme = resolveChannelTheme(brief.channel_theme);
  const marker =
    brief.channel_theme === "emerald-editorial"
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

export function styleWechatArticle(
  article        ,
  brief                  ,
)         {
  return applyChannelRecipe(
    applyChannelTheme(article, resolveChannelTheme(brief.channel_theme)),
    brief,
  );
}

export function wrapChannelThemeProposals(
  title        ,
  articles                                ,
  selected                ,
)         {
  const panels = CHANNEL_THEMES.map(
    (theme) =>
      `<article data-proposal="${theme.id}"${theme.id === selected ? " data-selected" : ""}><header><strong>${visibleText(theme.label)}</strong><span>${visibleText(theme.reason)}</span></header><main data-article>${articles[theme.id]}</main></article>`,
  ).join("");
  const buttons = CHANNEL_THEMES.map(
    (theme) =>
      `<button type="button" data-theme="${theme.id}"${theme.id === selected ? ' aria-pressed="true"' : ""}>${visibleText(theme.label)}</button>`,
  ).join("");
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${visibleText(title)} · 主题方案</title><style>
  *{box-sizing:border-box}body{margin:0;background:#111915;color:#eef4ef;font:14px/1.6 system-ui,sans-serif}.shell{min-height:100vh}.toolbar{position:sticky;top:0;z-index:4;display:flex;gap:8px;align-items:center;padding:12px 18px;background:#111915eF;border-bottom:1px solid #ffffff24}.toolbar button{padding:8px 12px;border:1px solid #ffffff38;background:transparent;color:inherit;cursor:pointer}.toolbar button[aria-pressed="true"]{background:#e7eee8;color:#193c2d}.toolbar [data-mode]{margin-left:auto}.stage{padding:28px}.stage article{display:none}.stage article[data-selected]{display:block}.stage article>header{width:min(100%,677px);margin:0 auto 12px;display:grid}.stage article>header span{color:#a9b8ae}.stage main{width:min(100%,677px);margin:auto;background:#f5f1e8;box-shadow:0 18px 60px #0008}.stage.compare{display:grid;grid-template-columns:repeat(3,minmax(360px,1fr));gap:20px;overflow:auto}.stage.compare article{display:block}.stage.compare article main{width:100%}.stage.compare article>header{width:100%}.copy{position:fixed;right:18px;bottom:18px;padding:11px 16px;border:0;background:#d6e6da;color:#173d2d;font-weight:700}
  @media(max-width:720px){.toolbar{position:fixed;inset:auto 0 0;overflow:auto}.toolbar [data-mode]{display:none}.stage{padding:16px 12px 84px}.stage.compare{display:block}.stage.compare article:not([data-selected]){display:none}.copy{right:12px;bottom:64px}}
  </style></head><body><section class="shell"><nav class="toolbar">${buttons}<button type="button" data-mode>并排比较</button></nav><section class="stage">${panels}</section><button class="copy" type="button" data-copy>复制当前正文</button></section><script>
  const stage=document.querySelector(".stage"),buttons=[...document.querySelectorAll("[data-theme]")],articles=[...document.querySelectorAll("[data-proposal]")];let selected=${JSON.stringify(selected)};function choose(id){selected=id;buttons.forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.theme===id)));articles.forEach(article=>article.toggleAttribute("data-selected",article.dataset.proposal===id))}buttons.forEach(button=>button.onclick=()=>choose(button.dataset.theme));document.querySelector("[data-mode]").onclick=()=>stage.classList.toggle("compare");${clipboardRuntime(`document.querySelector('[data-proposal="'+selected+'"] [data-article]')`)}choose(selected);
  </script></body></html>`;
}


//# sourceURL=k-teach/src/channel-themes.ts