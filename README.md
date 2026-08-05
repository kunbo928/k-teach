# K Teach

English · [简体中文](README-zh.md)

K Teach is an Agent Skill for turning an AI agent into a persistent,
mission-driven teacher. It helps the agent understand what you want to learn,
design the next useful lesson, create polished learning experiences, and adapt
future teaching to evidence of what you actually understand.

It follows the open Agent Skills format. `SKILL.md` is the platform-neutral
contract, so any compatible agent platform can use the same teaching workflow,
references, assets, and deterministic CLI.

## Platform compatibility

K Teach does not depend on Codex, ChatGPT, Claude, or another specific agent
runtime. Compatible platforms discover the Skill through `SKILL.md`.
Files under `agents/` are optional product-specific UI adapters; for example,
`agents/openai.yaml` improves the OpenAI/Codex presentation but does not define
the Skill or affect its behavior on other platforms.

## What the Skill does

K Teach guides the agent through the full teaching loop:

1. Establish a concrete learning mission and observable success criteria.
2. Inspect prior knowledge, learning records, trusted sources, and preferences.
3. Select the smallest useful challenge just above the learner's demonstrated
   level.
4. Research factual claims against trustworthy primary sources.
5. Build a focused Lesson Bundle with explanation, practice, feedback, and
   retrieval.
6. Choose the right teaching medium: text, deterministic diagrams, or optional
   generated visuals.
7. Resolve the intended use, then produce a learning page, WeChat layout, or
   HTML presentation.
8. Record demonstrated learning and use it to choose what comes next.

The result is not a stream of disconnected answers. It is a learning workspace
that preserves the mission, course content, evidence, and teaching decisions
across sessions.

## When to use K Teach

Use this Skill when you want an AI agent to:

- teach a topic over multiple sessions;
- turn a broad goal into an actionable learning path;
- create or revise a lesson;
- explain a difficult concept with practice and feedback;
- build an interactive local course page;
- track demonstrated understanding and misconceptions;
- create diagrams or visual learning assets when they improve comprehension;
- derive a selected lesson into a WeChat article.
- derive teaching content into an HTML slide deck.

Example requests:

```text
Use K Teach to help me learn distributed systems.

Continue my TypeScript learning workspace and design the next lesson.

Turn this concept into a 15-minute lesson with an exercise and retrieval check.

Create a diagram that explains the state transitions in this lesson.

Turn this lesson into a PPT-style deck for a technical talk.
```

## Teaching model

### Learning Project and Teach

A Learning Project contains multiple isolated Teachs. Each Teach has one
mission and independently stores trusted resources, glossary, stable
preferences, learning records, Lesson Bundles, and rendered artifacts.

### Lesson Bundle

The authoritative source for one lesson. It contains channel-independent
content, metadata, exercises, feedback rules, and original media. Rendered
outputs may rearrange or compress it, but may not change its facts, objectives,
citations, or answers.

### Demonstrated learning

K Teach does not treat reading, exposure, or page completion as proof of
learning. It records evidence only when the learner explains, retrieves,
applies, transfers, or corrects something meaningful.

### One learning win

Each lesson targets one concrete capability and follows a compact loop:

- activate relevant prior knowledge;
- explain only what the task requires;
- provide realistic practice;
- place specific feedback next to the action;
- finish with retrieval without looking back.

## Outputs

K Teach can produce:

- **Web Lessons** — complete local learning experiences with exercises and
  answers;
- **Diagrams** — deterministic, accessible SVG teaching diagrams;
- **Generated visuals** — optional illustrations registered through an
  explicit visual plan;
- **WeChat articles** — selected public derivatives created only from an
  explicit Publication Brief;
- **HTML presentations** — slide decks with keyboard navigation and presenter
  notes derived from the Lesson Bundle;
- **Learning records** — concise evidence that changes future teaching.

Generated visuals are never required for the core lesson. A local lesson is
private by default. Public publishing is a separate, explicitly authorized
operation.

When the intended use is unclear, K Teach first asks whether the content is for
learning, a WeChat official account, or a PPT. K Teach handles all three routes
itself: the existing Field Manual Web Lesson, platform-safe WeChat article
HTML with a copy preview and validation manifest, or a themed 16:9 static HTML
presentation with navigation, overview, presenter notes, and print export. No
other Skill is required.

Web and PPT share seven Teaching Themes. WeChat has an independent Channel
Theme catalog: Emerald Editorial is the default delivery, while Graphite
Minimal and Olive Journal are generated only when the user explicitly asks to
compare theme proposals.

## Installation

Install the persistent CLI globally, then initialize the target project:

```bash
npm install -g k-teach@latest
cd your-learning-project
k-teach init
```

`init` creates `.k-teach/config.yaml`, the `teachs/` collection, an initial
Teach, and project-level integrations for detected or selected Agents. For automation:

```bash
k-teach init --tools codex,claude --teach mathematics
k-teach teach create photography
```

Detected Agents are pre-selected in the interactive prompt. Pass `--yes` (or
`-y`) to skip the prompt and install to every detected Agent without choosing.
The Skill is installed once as the canonical copy under `.agents/skills/k-teach`
(the location read by Codex, Cursor, Gemini CLI, OpenCode, and GitHub Copilot),
and every other Agent gets a symlink to that copy. Pass `--copy` to materialize
independent copies instead of symlinks when symlinks are unsupported. WorkBuddy
is detected automatically whenever `.workbuddy` is present.

If exactly one user-level WeChat account is registered, `init` records its
alias as `wechat_account` in `.k-teach/config.yaml`. With multiple registered
accounts, interactive `init` asks once for the project default; in a
non-interactive environment, pass `--wechat-account <alias>`. AppSecret is
never written to project configuration.

User-level state follows each platform's environment conventions: XDG paths
when configured, `%APPDATA%/k-teach` and `%LOCALAPPDATA%/k-teach/cache` on
Windows, and the existing `~/.config/k-teach` and `~/.cache/k-teach` layout on
macOS and Linux.

For a one-time trial, `npx k-teach init --tools ...` is supported. Persistent
Agent use still requires the global CLI because generated Skills invoke
`k-teach` through `PATH`.

## Repository structure

```text
k-teach/
├── SKILL.md          # Agent workflow and behavioral boundaries
├── references/       # Teaching, domain, visual, and publishing guidance
├── assets/           # Lesson, visual, and publication templates
├── schemas/          # Contracts for learning and publication artifacts
├── agents/           # Optional product-specific UI adapters
├── src/              # Source for deterministic support operations
├── bin/               # Bundled command entry point
└── tests/             # Contract and behavior tests
```

Start with [`SKILL.md`](SKILL.md). The files under `references/` provide deeper
instructions that the Skill loads only when a task needs them.

## Bundled support tools

K Teach includes a small deterministic CLI used by the Skill for operations
that should be reproducible and testable:

- initialize and validate a Learning Workspace;
- render Web Lessons and structured diagrams;
- preview the local course;
- register externally generated visual assets;
- render selected WeChat articles;
- render HTML presentations from Lesson Bundles;
- perform explicitly authorized WeChat publication operations.

The CLI supports the Skill; it does not decide what to teach.

```bash
k-teach capabilities --json
k-teach tools --json
k-teach init --tools codex,claude
k-teach update
k-teach generate --intent learn --lesson <lesson-id> --json
k-teach generate --intent ppt --brief <presentation-brief-id> --json
k-teach generate --intent wechat --brief <publication-brief-id> [--draft] --json
k-teach inspect --run <run-id> --json
k-teach wechat account add <alias> --app-id <id> --name <name>
k-teach preview [--open]
```

Run `k-teach preview` from the Learning Project root to render and serve every
Teach through one local Project Preview. Run it inside `teachs/<id>`, or pass
`--teach <id>`, to preview only the selected Teach. The bundled Vite runtime
serves `/teachs/`, `/ppt/`, and `/wechat/`; Learning Projects need no local
Node setup. It binds only to `127.0.0.1` and opens a browser only with
`--open`.

A Presentation Brief and Slide Plan distinguish classroom teaching from a talk. Every deck
is one genuinely self-contained `index.html`, including media, CSS, and the
presenter runtime. Multiple WeChat AppIDs can be registered by alias; AppSecret
is resolved only from the matching environment variable and is never stored.

## Releases

Add `pnpm changeset` to each user-visible package change and select the SemVer
impact. Changesets Action maintains a release pull request on `main`; merging
that pull request publishes the prepared version through npm Trusted
Publishing. The npm package must trust GitHub repository `kunbo928/k-teach`,
workflow `release.yml`, and environment `npm`.

## Development

Clone the repository and install its development dependencies:

```bash
git clone git@github.com:kunbo928/k-teach.git
cd k-teach
pnpm install
```

Development requires Node.js `>= 22.18` and pnpm.

```bash
pnpm build
pnpm typecheck
pnpm test
```

Edit the TypeScript source in `src/` and rebuild generated files in `dist/`.
Do not edit `dist/` directly.

## Safety boundaries

- Keep facts, sources, objectives, and answer keys consistent across outputs.
- Never place credentials in the Skill, workspace, artifacts, manifests, or
  logs.
- Use only the official WeChat API.
- Never assume a local lesson is public.
- Require current interactive confirmation before public publishing.
- Treat rendered artifacts as immutable once a publication attempt begins.

## Documentation

- [`references/teaching-workflow.md`](references/teaching-workflow.md)
- [`references/output-intents.md`](references/output-intents.md)
- [`references/teaching-themes.md`](references/teaching-themes.md)
- [`references/core-contracts.md`](references/core-contracts.md)
- [`references/diagrams.md`](references/diagrams.md)
- [`references/visual-providers.md`](references/visual-providers.md)
- [`references/wechat-rendering.md`](references/wechat-rendering.md)
