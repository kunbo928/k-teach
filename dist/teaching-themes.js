export const TEACHING_THEME_IDS = [
  "classic-manual",
  "storybook",
  "nature-explorer",
  "active-classroom",
  "junior-lab",
  "editorial-desk",
  "future-lab",
]         ;























export const TEACHING_THEMES                           = [
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
      accentSoft: "#E0E8E2",
      code: "#E5E8DF",
    },
    display: '"Songti SC",STSong,Georgia,serif',
    radius: "2px",
    pattern: "rule",
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
      accentSoft: "#FFE0C8",
      code: "#F7E8D7",
    },
    display: '"Kaiti SC","STKaiti","Songti SC",serif',
    radius: "24px",
    pattern: "cloud",
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
      accentSoft: "#DDE9C9",
      code: "#E5ECD8",
    },
    display: '"Kaiti SC","STKaiti",Georgia,serif',
    radius: "14px",
    pattern: "leaf",
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
      accentSoft: "#DCE8FF",
      code: "#EEF2FA",
    },
    display: '"Arial Rounded MT Bold","PingFang SC",sans-serif',
    radius: "16px",
    pattern: "confetti",
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
      accentSoft: "#CDECEF",
      code: "#DDECEF",
    },
    display: '"Avenir Next","PingFang SC",sans-serif',
    radius: "8px",
    pattern: "grid",
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
      accentSoft: "#EEDDD6",
      code: "#E9E6DF",
    },
    display: '"Songti SC","STSong","Times New Roman",serif',
    radius: "0px",
    pattern: "columns",
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
      accentSoft: "#173F48",
      code: "#101E2C",
    },
    display: '"Avenir Next","PingFang SC",sans-serif',
    radius: "6px",
    pattern: "circuit",
  },
]         ;

export function isTeachingThemeId(value         )                           {
  return (
    typeof value === "string" &&
    (TEACHING_THEME_IDS                     ).includes(value)
  );
}

export function resolveTeachingTheme(value         )                {
  const normalized = value === "field-manual" ? "classic-manual" : value;
  return (
    TEACHING_THEMES.find((theme) => theme.id === normalized) ??
    TEACHING_THEMES[0]
  );
}


//# sourceURL=k-teach/src/teaching-themes.ts