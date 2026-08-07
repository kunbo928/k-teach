export const TEACHING_THEME_IDS = [
  "classic-manual",
  "storybook",
  "nature-explorer",
  "active-classroom",
  "junior-lab",
  "editorial-desk",
  "future-lab",
] as const;

export type TeachingThemeId = (typeof TEACHING_THEME_IDS)[number];

export interface TeachingThemeColors {
  background: string;
  surface: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accentInk: string;
  accentSoft: string;
  code: string;
  success?: string;
  warning?: string;
  danger?: string;
}

export interface TeachingThemeSurface {
  radius?: string;
  border?: string;
  shadow?: string;
  headingTransform?: string;
  pattern?: string;
  patternBackgroundSize?: string;
  colorScheme?: "dark";
}

export interface TeachingTheme {
  id: TeachingThemeId;
  label: string;
  stage: "neutral" | "kindergarten" | "primary" | "secondary";
  description: string;
  colors: TeachingThemeColors;
  display: string;
  radius: string;
  pattern: "rule" | "cloud" | "leaf" | "confetti" | "grid" | "columns" | "circuit";
  surface: TeachingThemeSurface;
  night?: Partial<Pick<TeachingThemeColors, "background" | "surface" | "ink" | "muted" | "line" | "accent" | "accentInk" | "code">>;
  webChrome?: string;
  pptChrome?: string;
}

const DEFAULT_SURFACE: TeachingThemeSurface = {
  radius: "2px",
  border: "1px",
  shadow: "none",
  headingTransform: "none",
  pattern: `linear-gradient(
      90deg,
      transparent 0 4.5rem,
      color-mix(in srgb, var(--line) 40%, transparent) 4.5rem 4.56rem,
      transparent 4.56rem
    )`,
};

export const TEACHING_THEMES: readonly TeachingTheme[] = [
  {
    id: "classic-manual",
    label: "经典手册",
    stage: "neutral",
    description: "克制的纸面编辑风，适合任何阶段和高密度阅读。",
    colors: {
      background: "#F2F0E8",
      surface: "#FBFAF5",
      ink: "#17231D",
      muted: "#5F6A63",
      line: "#B8BEB7",
      accent: "#315F49",
      accentInk: "#F6F8F4",
      accentSoft: "#E0E8E2",
      code: "#E5E8DF",
    },
    display: '"Songti SC", STSong, Georgia, serif',
    radius: "2px",
    pattern: "rule",
    surface: {},
  },
  {
    id: "storybook",
    label: "故事绘本",
    stage: "kindergarten",
    description: "温暖的绘本舞台、柔和大字与圆润叙事卡片。",
    colors: {
      background: "#FFF5E7",
      surface: "#FFFCF6",
      ink: "#49352D",
      muted: "#7D655B",
      line: "#E7CDBB",
      accent: "#D95F59",
      accentInk: "#FFFAF2",
      accentSoft: "#FFE0C8",
      code: "#F7E8D7",
    },
    display: '"Kaiti SC", STKaiti, "Songti SC", serif',
    radius: "24px",
    pattern: "cloud",
    surface: {
      radius: "24px",
      border: "2px",
      shadow: "0 12px 30px color-mix(in srgb, var(--accent) 12%, transparent)",
      pattern: `radial-gradient(circle at 12% 8%, #ffe0c8 0 2.8rem, transparent 2.9rem),
    radial-gradient(circle at 88% 24%, #f7d9d6 0 2rem, transparent 2.1rem)`,
    },
    night: {
      background: "#241A1A",
      surface: "#302321",
      accent: "#FF9A8F",
      line: "#684A45",
    },
    webChrome: `:root[data-teaching-theme="storybook"] .lesson-hero {
  border: var(--theme-border) solid var(--line);
  border-radius: var(--theme-radius);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  padding-inline: clamp(1.4rem, 5vw, 4rem);
}`,
    pptChrome: `[data-theme="storybook"] .slide::before{content:"";position:absolute;inset:3% 3% auto auto;width:18%;height:11%;border-radius:50%;background:var(--accent-soft);box-shadow:-4rem 2rem 0 var(--accent-soft)}`,
  },
  {
    id: "nature-explorer",
    label: "自然探索",
    stage: "kindergarten",
    description: "植物标本、观察标签与自然绿色的探索笔记。",
    colors: {
      background: "#F1F4E8",
      surface: "#FBFCF5",
      ink: "#24382C",
      muted: "#617061",
      line: "#B8C8AE",
      accent: "#4C7A4A",
      accentInk: "#F7FBF3",
      accentSoft: "#DDE9C9",
      code: "#E5ECD8",
    },
    display: '"Kaiti SC", STKaiti, Georgia, serif',
    radius: "14px",
    pattern: "leaf",
    surface: {
      radius: "14px",
      shadow: "0 10px 24px #315f4912",
      pattern: `radial-gradient(ellipse at 8% 20%, #dce9c8 0 1.5rem, transparent 1.6rem),
    radial-gradient(ellipse at 92% 72%, #cadcb8 0 2rem, transparent 2.1rem)`,
    },
    night: {
      background: "#131D15",
      surface: "#1B281D",
      accent: "#9BC28A",
      line: "#415C43",
    },
    webChrome: `:root[data-teaching-theme="nature-explorer"] .lesson-hero {
  border: var(--theme-border) solid var(--line);
  border-radius: var(--theme-radius);
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  padding-inline: clamp(1.4rem, 5vw, 4rem);
}`,
    pptChrome: `[data-theme="nature-explorer"] .slide::before{content:"✦  OBSERVE  ·  CLASSIFY  ·  DISCOVER";position:absolute;right:6%;bottom:5%;color:var(--accent);font-size:.8vw;letter-spacing:.12em}`,
  },
  {
    id: "active-classroom",
    label: "活力课堂",
    stage: "primary",
    description: "清晰的课堂色块、进度感和积极的练习反馈。",
    colors: {
      background: "#FFF8DB",
      surface: "#FFFFFF",
      ink: "#19263B",
      muted: "#5B6779",
      line: "#B9C7DD",
      accent: "#2962D9",
      accentInk: "#FFFFFF",
      accentSoft: "#DCE8FF",
      code: "#EEF2FA",
    },
    display: '"Arial Rounded MT Bold", "PingFang SC", sans-serif',
    radius: "16px",
    pattern: "confetti",
    surface: {
      radius: "16px",
      border: "2px",
      shadow: "0 9px 0 #19263b12",
      headingTransform: "rotate(-0.35deg)",
      pattern: `linear-gradient(135deg, transparent 94%, #ffbf3f 94%),
    radial-gradient(circle at 92% 14%, #ff705d 0 0.55rem, transparent 0.6rem),
    radial-gradient(circle at 8% 74%, #3fc4a1 0 0.45rem, transparent 0.5rem)`,
    },
    night: {
      background: "#10182A",
      surface: "#18243A",
      accent: "#7EABFF",
      line: "#3C547C",
    },
    webChrome: `:root[data-teaching-theme="active-classroom"] .lesson-kicker {
  width: fit-content;
  border: 1px solid var(--accent);
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 800;
  letter-spacing: 0.08em;
}`,
    pptChrome: `[data-theme="active-classroom"] .slide{border:3px solid var(--ink);box-shadow:10px 10px 0 var(--accent)}[data-theme="active-classroom"] .slide h2{transform:rotate(-.5deg)}`,
  },
  {
    id: "junior-lab",
    label: "少年实验室",
    stage: "primary",
    description: "蓝图网格、实验标签与强调推理过程的制作台。",
    colors: {
      background: "#EDF5F7",
      surface: "#FDFEFE",
      ink: "#102E3B",
      muted: "#54707B",
      line: "#9DBBC4",
      accent: "#007E8A",
      accentInk: "#F5FFFF",
      accentSoft: "#CDECEF",
      code: "#DDECEF",
    },
    display: '"Avenir Next", "PingFang SC", sans-serif',
    radius: "8px",
    pattern: "grid",
    surface: {
      radius: "8px",
      shadow: "0 12px 28px #102e3b14",
      pattern: `linear-gradient(#9dbbc426 1px, transparent 1px),
    linear-gradient(90deg, #9dbbc426 1px, transparent 1px)`,
      patternBackgroundSize: "28px 28px",
    },
    night: {
      background: "#0B1C24",
      surface: "#132A34",
      accent: "#58D2DF",
      line: "#37606A",
    },
    webChrome: `:root[data-teaching-theme="junior-lab"] .lesson-kicker {
  width: fit-content;
  border: 1px solid var(--accent);
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 800;
  letter-spacing: 0.08em;
}`,
    pptChrome: `[data-theme="junior-lab"] .slide{background-image:linear-gradient(#9dbbc426 1px,transparent 1px),linear-gradient(90deg,#9dbbc426 1px,transparent 1px);background-size:28px 28px}`,
  },
  {
    id: "editorial-desk",
    label: "编辑部",
    stage: "secondary",
    description: "报刊栏线、强标题与适合论证和深度阅读的编辑设计。",
    colors: {
      background: "#F4F1EA",
      surface: "#FCFBF7",
      ink: "#181818",
      muted: "#606060",
      line: "#AAA59B",
      accent: "#A52A2A",
      accentInk: "#FFFFFF",
      accentSoft: "#EEDDD6",
      code: "#E9E6DF",
    },
    display: '"Songti SC", STSong, "Times New Roman", serif',
    radius: "0px",
    pattern: "columns",
    surface: {
      radius: "0",
      border: "1px",
      headingTransform: "none",
      pattern: `repeating-linear-gradient(
      90deg,
      transparent 0 calc(25% - 1px),
      #aaa59b20 calc(25% - 1px) 25%
    )`,
    },
    night: {
      background: "#171514",
      surface: "#211E1C",
      accent: "#E0776F",
      line: "#5B5550",
    },
    webChrome: `:root[data-teaching-theme="editorial-desk"] .lesson-content > p:first-of-type {
  font-family: var(--display);
  font-size: var(--step-1);
}

:root[data-teaching-theme="editorial-desk"] h2 {
  border-block: 3px double var(--ink);
  padding-block: 0.35em;
  text-transform: uppercase;
}`,
    pptChrome: `[data-theme="editorial-desk"] .slide h2{border-block:4px double var(--ink);padding-block:.18em}`,
  },
  {
    id: "future-lab",
    label: "未来研究所",
    stage: "secondary",
    description: "深色系统界面、荧光信息层级与工程研究氛围。",
    colors: {
      background: "#0D1724",
      surface: "#142335",
      ink: "#EAF5F4",
      muted: "#9AB2BA",
      line: "#345363",
      accent: "#35D0BA",
      accentInk: "#071815",
      accentSoft: "#173F48",
      code: "#101E2C",
      success: "#52D89E",
      warning: "#E2B55F",
      danger: "#FF8077",
    },
    display: '"Avenir Next", "PingFang SC", sans-serif',
    radius: "6px",
    pattern: "circuit",
    surface: {
      radius: "6px",
      shadow: "0 0 0 1px #35d0ba24, 0 16px 36px #00000040",
      pattern: `linear-gradient(#35d0ba12 1px, transparent 1px),
    linear-gradient(90deg, #35d0ba12 1px, transparent 1px),
    radial-gradient(circle at 84% 14%, #6f5cff24 0 7rem, transparent 7.1rem)`,
      patternBackgroundSize: "40px 40px, 40px 40px, auto",
      colorScheme: "dark",
    },
    webChrome: `:root[data-teaching-theme="future-lab"] .lesson-kicker {
  width: fit-content;
  border: 1px solid var(--accent);
  border-radius: 999px;
  padding: 0.25rem 0.65rem;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 800;
  letter-spacing: 0.08em;
}

:root[data-teaching-theme="future-lab"] .exercise,
:root[data-teaching-theme="future-lab"] .lesson-figure {
  backdrop-filter: blur(8px);
}`,
    pptChrome: `[data-theme="future-lab"] .slide{background-image:linear-gradient(#35d0ba12 1px,transparent 1px),linear-gradient(90deg,#35d0ba12 1px,transparent 1px);background-size:40px 40px;box-shadow:0 0 0 1px var(--accent),0 24px 80px #0008}`,
  },
];

function cssColor(value: string): string {
  return value.toLowerCase();
}

function emitThemeVars(theme: TeachingTheme): string {
  const lines = [
    `  --paper: ${cssColor(theme.colors.background)};`,
    `  --surface: ${cssColor(theme.colors.surface)};`,
    `  --ink: ${cssColor(theme.colors.ink)};`,
    `  --muted: ${cssColor(theme.colors.muted)};`,
    `  --line: ${cssColor(theme.colors.line)};`,
    `  --accent: ${cssColor(theme.colors.accent)};`,
    `  --accent-ink: ${cssColor(theme.colors.accentInk)};`,
    `  --code: ${cssColor(theme.colors.code)};`,
    `  --display: ${theme.display};`,
  ];
  if (theme.colors.success) lines.push(`  --success: ${cssColor(theme.colors.success)};`);
  if (theme.colors.warning) lines.push(`  --warning: ${cssColor(theme.colors.warning)};`);
  if (theme.colors.danger) lines.push(`  --danger: ${cssColor(theme.colors.danger)};`);
  if (theme.surface.colorScheme) lines.unshift(`  color-scheme: ${theme.surface.colorScheme};`);
  if (theme.surface.radius !== undefined) lines.push(`  --theme-radius: ${theme.surface.radius};`);
  if (theme.surface.border !== undefined) lines.push(`  --theme-border: ${theme.surface.border};`);
  if (theme.surface.shadow !== undefined) lines.push(`  --theme-shadow: ${theme.surface.shadow};`);
  if (theme.surface.headingTransform !== undefined) {
    lines.push(`  --theme-heading-transform: ${theme.surface.headingTransform};`);
  }
  if (theme.surface.pattern !== undefined) {
    lines.push(`  --theme-pattern:\n    ${theme.surface.pattern};`);
  }
  if (theme.surface.patternBackgroundSize !== undefined) {
    lines.push(`  background-size: ${theme.surface.patternBackgroundSize};`);
  }
  return `:root[data-teaching-theme="${theme.id}"] {\n${lines.join("\n")}\n}`;
}

function emitNightOverrides(theme: TeachingTheme): string {
  if (!theme.night) return "";
  const lines: string[] = [];
  if (theme.night.background) lines.push(`  --paper: ${cssColor(theme.night.background)};`);
  if (theme.night.surface) lines.push(`  --surface: ${cssColor(theme.night.surface)};`);
  if (theme.night.ink) lines.push(`  --ink: ${cssColor(theme.night.ink)};`);
  if (theme.night.muted) lines.push(`  --muted: ${cssColor(theme.night.muted)};`);
  if (theme.night.line) lines.push(`  --line: ${cssColor(theme.night.line)};`);
  if (theme.night.accent) lines.push(`  --accent: ${cssColor(theme.night.accent)};`);
  if (theme.night.accentInk) lines.push(`  --accent-ink: ${cssColor(theme.night.accentInk)};`);
  if (theme.night.code) lines.push(`  --code: ${cssColor(theme.night.code)};`);
  return `:root[data-theme="night"][data-teaching-theme="${theme.id}"] {\n${lines.join("\n")}\n}`;
}

/** Emit the Field Manual Teaching Theme stylesheet for Web Lesson. */
export function emitWebTeachingThemesCss(): string {
  const defaults = [
    `:root {`,
    `  --theme-radius: ${DEFAULT_SURFACE.radius};`,
    `  --theme-border: ${DEFAULT_SURFACE.border};`,
    `  --theme-shadow: ${DEFAULT_SURFACE.shadow};`,
    `  --theme-heading-transform: ${DEFAULT_SURFACE.headingTransform};`,
    `  --theme-pattern:`,
    `    ${DEFAULT_SURFACE.pattern};`,
    `}`,
  ].join("\n");

  const themes = TEACHING_THEMES.map(emitThemeVars).join("\n\n");
  const nightBase = `:root[data-theme="night"][data-teaching-theme] {
  color-scheme: dark;
  --paper: #101713;
  --surface: #17201b;
  --ink: #e9ede8;
  --muted: #a9b3ac;
  --line: #3b4840;
  --accent-ink: #101713;
  --code: #202c25;
}`;
  const nightThemes = TEACHING_THEMES.map(emitNightOverrides).filter(Boolean).join("\n\n");
  const shared = `body {
  background: var(--theme-pattern), var(--paper);
}

.lesson-hero h1,
.course-index h1 {
  transform: var(--theme-heading-transform);
}

.exercise,
.lesson-entry,
.lesson-figure {
  border-width: var(--theme-border);
  border-radius: var(--theme-radius);
  box-shadow: var(--theme-shadow);
}

.exercise,
.lesson-figure {
  overflow: hidden;
}

.theme-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.theme-controls label {
  font-size: var(--step--1);
  color: var(--muted);
}

.teaching-theme-select {
  min-height: 44px;
  border: 1px solid var(--line);
  border-radius: var(--theme-radius);
  background: var(--surface);
  color: var(--ink);
  padding: 0.45rem 2rem 0.45rem 0.7rem;
  font: inherit;
}

@media (max-width: 767px) {
  .theme-controls {
    width: 100%;
    justify-content: flex-start;
  }
}

@media (prefers-reduced-motion: no-preference) {
  :root[data-teaching-theme="storybook"] .lesson-hero,
  :root[data-teaching-theme="active-classroom"] .exercise {
    animation: theme-arrive 420ms ease-out both;
  }

  @keyframes theme-arrive {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
  }
}

@media print {
  :root[data-teaching-theme] {
    color-scheme: light;
    --paper: #ffffff;
    --surface: #ffffff;
    --ink: #17231d;
    --muted: #4d5650;
    --line: #aeb5af;
    --accent: #315f49;
    --code: #eef0eb;
    --theme-pattern: none;
    --theme-shadow: none;
  }
}`;
  const chrome = TEACHING_THEMES.map((theme) => theme.webChrome).filter(Boolean).join("\n\n");
  return [defaults, themes, nightBase, nightThemes, shared, chrome].filter(Boolean).join("\n\n") + "\n";
}

/** Emit PPT deck theme variables and per-theme slide chrome. */
export function emitPptThemeCss(): string {
  const vars = TEACHING_THEMES.map(
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
  const chrome = TEACHING_THEMES.map((theme) => theme.pptChrome).filter(Boolean).join("");
  return `${vars}\n${chrome}`;
}

export function isTeachingThemeId(value: unknown): value is TeachingThemeId {
  return (
    typeof value === "string" &&
    (TEACHING_THEME_IDS as readonly string[]).includes(value)
  );
}

export function resolveTeachingTheme(value: unknown): TeachingTheme {
  const normalized = value === "field-manual" ? "classic-manual" : value;
  return (
    TEACHING_THEMES.find((theme) => theme.id === normalized) ??
    TEACHING_THEMES[0]
  );
}
