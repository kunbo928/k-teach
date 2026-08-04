# Teaching Themes

Teaching Theme is the selectable visual-expression layer. It is independent
from Lesson Bundle content, `reading` / `workshop` / `atlas` composition, and
`paper` / `night` / `print` display mode.

## Catalog

| ID | 名称 | 推荐阶段 | 视觉语言 |
| --- | --- | --- | --- |
| `classic-manual` | 经典手册 | 中性 | 纸面编辑、细线、克制绿色 |
| `storybook` | 故事绘本 | 幼儿园 | 温暖绘本、圆润舞台、柔和大字 |
| `nature-explorer` | 自然探索 | 幼儿园 | 植物标本、观察标签、自然绿色 |
| `active-classroom` | 活力课堂 | 小学 | 课堂色块、强反馈、积极节奏 |
| `junior-lab` | 少年实验室 | 小学 | 蓝图网格、实验标签、制作台 |
| `editorial-desk` | 编辑部 | 中学 | 报刊栏线、强标题、深度阅读 |
| `future-lab` | 未来研究所 | 中学 | 深色系统、荧光层级、工程研究 |

All seven themes define their own palette, display typography, geometry,
background pattern, component treatment, and restrained motion. They share the
same semantic components and must never alter lesson order, facts, exercises,
answers, grading, sources, or accessible fallbacks.

## Selection

For Web Lessons, set `theme_default` in `teach.yaml`:

```yaml
theme_default: junior-lab
```

The rendered selector always exposes all seven themes. A browser-local
preference is stored by stable Teach ID and overrides `theme_default`. “恢复默认”
clears that preference. Invalid or missing values fall back to
`classic-manual`.

For a WeChat Publication Brief, set:

```yaml
theme: editorial-desk
```

For a PPT, record the theme in its Presentation Brief and run:

```sh
k-teach generate --intent ppt --brief <presentation-brief-id> --json
```

If the Brief does not choose a theme, PPT uses the Teach default, then
`classic-manual`. Press `T` inside the generated deck to cycle through all seven
implemented themes.

## Display modes

Teaching Theme and Display Mode remain independent. `night` keeps each theme’s
identity while using a dark accessible palette. `print` has final precedence:
white background, high contrast, no background pattern, no nonessential motion,
and complete exercises, answers, sources, and diagrams.
