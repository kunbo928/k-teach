---
name: k-teach
description: Build and maintain multiple mission-driven Teachs with source-grounded Lesson Bundles, polished local Web Lessons, deterministic diagrams, optional generated visuals, and explicitly selected WeChat articles. Use when an AI agent needs to teach topics over multiple sessions, create or revise a lesson, design an interactive course page, track learning progress, or prepare content for a WeChat official account.
---

# K Teach

Treat the Learning Project as a container for independent Teachs. Each Teach
owns its persistent learning state, and each Lesson Bundle is the authoritative
source for one lesson. Keep teaching decisions in the agent
workflow; use the bundled `k-teach` CLI only for deterministic validation,
rendering, preview, media processing, and publication operations.

## Workflow

1. Select the intended Teach. If it does not exist, create it with
   `k-teach teach create <id>`. Read that Teach's mission, current learning state, trusted sources, and
   existing Lesson Bundles before proposing work.
2. Define the next lesson around a concrete capability the learner should gain.
3. Research claims against suitable primary sources and record citations.
4. Create or revise the Lesson Bundle without writing channel-specific content
   back into it. Store every learner action as a schema-valid
   `exercises/*.yaml` file; never create Markdown exercise or answer-sheet
   files, which Web rendering does not consume. Place every exercise exactly
   once with `{{exercise:<id>}}` at the relevant point in `lesson.md`; never
   direct the learner to open an exercise file.
5. Choose a Learning Asset Plan: deterministic Diagram, optional generated
   visuals, or text only. Never make generated visuals a prerequisite for core
   teaching. Declare every selected local Diagram, illustration, interactive,
   or narration in `media/assets.yaml`, then place it at the exact teaching
   moment with `{{asset:<id>}}` in `lesson.md`. Audio requires an equivalent
   transcript; interactive assets must remain usable through adjacent text.
6. Render the complete local Web Lesson with the selected Field Manual profile.
7. Create a WeChat article only when the user supplies an explicit Publication
   Brief selecting what may be public.
8. Stop at local output or draft unless the user separately authorizes a real
   remote action. Public publishing always requires current interactive final
   confirmation.
9. Record learning results, artifact manifests, and publication attempts in the
   selected Teach.

## Non-negotiable boundaries

- Preserve facts, sources, learning goals, and answer keys across renderers.
- Keep exercises and answers in Web Lessons; omit them from WeChat articles.
- Do not assume a local lesson is public or add a link to it automatically.
- Never install Agent Integrations inside `teachs/<id>`; integrations belong
  to the Learning Project root.
- Never store credentials in the Skill, Teach, Lesson Bundle, artifact,
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

Run `k-teach capabilities --json` to inspect available deterministic
capabilities. Start a Learning Project with `k-teach init`; it creates
`teachs/main` by default, or use `--teach <id>` for another initial ID.
Create additional courses with `k-teach teach create <id>`. Run commands from
inside `teachs/<id>` or pass `--teach <id>`. Then run `k-teach validate`
before rendering. Generate the selected Teach with
`k-teach render web`. Use `k-teach preview` to render
again and serve the course only on `127.0.0.1`.
Render a validated Diagram Spec with
`k-teach render diagram path/to/spec.yaml`; use `--output` only
when the default `.k-teach/output/diagrams/` is not suitable.
Register an externally generated visual with
`k-teach visuals register --plan <plan.yaml> --result <result.yaml>`.
The CLI validates and records the output; it never invokes the provider.
Render an explicit Publication Brief with
`k-teach wechat render --brief <brief-id>`. This produces only
local article, preview, cover, media, and manifest files.
For an explicitly requested remote WeChat operation, read
[wechat-rendering.md](references/wechat-rendering.md), run `doctor wechat`,
create a draft, and persist the returned attempt ID. Preview requires an
explicit OpenID. Public publishing additionally requires the brief's
authorization, `--live`, and the exact phrase in a current interactive
terminal; never invent or add a non-interactive bypass.
