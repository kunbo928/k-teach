---
name: k-teach
description: Build and maintain a mission-driven learning workspace with source-grounded Lesson Bundles, polished local Web Lessons, deterministic diagrams, optional generated visuals, and explicitly selected WeChat articles. Use when an AI agent needs to teach a topic over multiple sessions, create or revise a lesson, design an interactive course page, track learning progress, or prepare content for a WeChat official account.
---

# K Teach

Treat the Learning Workspace as persistent state and each Lesson Bundle as the
authoritative source for one lesson. Keep teaching decisions in the agent
workflow; use the bundled `k-teach` CLI only for deterministic validation,
rendering, preview, media processing, and publication operations.

## Workflow

1. Read the workspace mission, current learning state, trusted sources, and
   existing Lesson Bundles before proposing work.
2. Define the next lesson around a concrete capability the learner should gain.
3. Research claims against suitable primary sources and record citations.
4. Create or revise the Lesson Bundle without writing channel-specific content
   back into it.
5. Choose a Learning Asset Plan: deterministic Diagram, optional generated
   visuals, or text only. Never make generated visuals a prerequisite for core
   teaching.
6. Render the complete local Web Lesson with the selected Field Manual profile.
7. Create a WeChat article only when the user supplies an explicit Publication
   Brief selecting what may be public.
8. Stop at local output or draft unless the user separately authorizes a real
   remote action. Public publishing always requires current interactive final
   confirmation.
9. Record learning results, artifact manifests, and publication attempts in the
   workspace.

## Non-negotiable boundaries

- Preserve facts, sources, learning goals, and answer keys across renderers.
- Keep exercises and answers in Web Lessons; omit them from WeChat articles.
- Do not assume a local lesson is public or add a link to it automatically.
- Never store credentials in the Skill, workspace, Lesson Bundle, artifact,
  manifest, logs, or errors.
- Use only the official WeChat API. Do not automate browser forms, cookies, or
  reverse-engineered endpoints.
- Treat rendered artifacts as immutable after a publication attempt starts.

Read [teaching-workflow.md](references/teaching-workflow.md) before selecting,
creating, or recording a lesson. Read
[core-contracts.md](references/core-contracts.md) when creating domain documents
or adapters. Read [diagrams.md](references/diagrams.md) when the Learning Asset
Plan calls for a process, relationship, or state diagram. Read a
channel-specific reference only when that channel is requested. Read
[visual-providers.md](references/visual-providers.md) before requesting or
registering generated visuals. Read
[wechat-rendering.md](references/wechat-rendering.md) before creating a
Publication Brief or rendering a WeChat article.

## CLI

Run `node bin/k-teach.js capabilities --json` to inspect available deterministic
capabilities. Start a workspace with `node bin/k-teach.js init`, then run
`node bin/k-teach.js validate` before rendering. Generate the local course with
`node bin/k-teach.js render web`. Use `node bin/k-teach.js preview` to render
again and serve the course only on `127.0.0.1`.
Render a validated Diagram Spec with
`node bin/k-teach.js render diagram path/to/spec.yaml`; use `--output` only
when the default `.k-teach/output/diagrams/` is not suitable.
Register an externally generated visual with
`node bin/k-teach.js visuals register --plan <plan.yaml> --result <result.yaml>`.
The CLI validates and records the output; it never invokes the provider.
Render an explicit Publication Brief with
`node bin/k-teach.js wechat render --brief <brief-id>`. This produces only
local article, preview, cover, media, and manifest files.
For an explicitly requested remote WeChat operation, read
[wechat-rendering.md](references/wechat-rendering.md), run `doctor wechat`,
create a draft, and persist the returned attempt ID. Preview requires an
explicit OpenID. Public publishing additionally requires the brief's
authorization, `--live`, and the exact phrase in a current interactive
terminal; never invent or add a non-interactive bypass.
