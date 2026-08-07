# Core contracts

## Authority

The Learning Project owns project configuration and Agent Integrations. Each
Teach under `teachs/<teach-id>/` owns independent learning state. A Lesson Bundle is the only
authoritative source for one lesson. Design Profiles, rendered artifacts, and
publication attempts are derived records and must never silently write back.

## Lesson Bundle

```text
teachs/<teach-id>/lessons/<lesson-id>/
├── lesson.yaml
├── lesson.md
├── exercises/
│   └── NNNN-exercise.yaml
└── media/
    ├── assets.yaml
    └── ...
```

`lesson.yaml` identifies the lesson, revision, mission, objectives, sources,
composition mode, and asset plan. `lesson.md` contains semantic teaching
content. Each exercise is YAML with `schema_version`, `id`, `prompt`, `answer`,
and `feedback`; Markdown exercise and answer-sheet files are invalid because
renderers cannot consume them. Exercises and media remain addressable inputs
rather than embedded channel output.

`media/assets.yaml` declares Embedded Learning Assets. `lesson.md` places each
asset at a semantic teaching moment with `{{asset:<id>}}`. Diagram and
illustration assets render as accessible figures, interactive assets as
sandboxed local documents, and audio assets as local players with mandatory
text transcripts. Missing media, stale lesson revisions, undeclared markers,
and declared-but-unused assets invalidate the Lesson Bundle.

Each exercise YAML is likewise placed exactly once with
`{{exercise:<id>}}`. The Web renderer expands it inline into the learner's
reading flow; it never collects exercises in a detached sidebar or tells the
learner to open source files.

## Rendering

A renderer consumes a validated Lesson Bundle, Design Profile, channel profile,
and capability report. It emits immutable files plus a manifest containing
input hashes, revisions, channel, files, warnings, and capability usage.

The Web renderer is required. Diagram rendering is deterministic and required.
Each Diagram render emits an accessible responsive SVG, a derived PNG, and a
dedicated manifest with the input hash, renderer version, Field Manual profile,
scale, and file list.
The Visual Provider is optional and follows `auto`, `required`, or `off`.
WeChat rendering requires a Publication Brief and excludes exercises, answers,
progress state, and implicit links to local lessons.
PPT rendering derives a static 16:9 HTML deck directly from a validated Lesson
Bundle. It selects presentation tokens from the composition mode, keeps
exercise answers in presenter notes, includes keyboard navigation, overview,
presenter mode, print export, and emits an Artifact Manifest with channel
`ppt`.

The WeChat renderer selects exact lesson sections from the brief, derives a
restricted inline-style HTML fragment, local preview shell, upload-ready media,
JPEG cover, and validation manifest. Media placeholders remain local until the
official Publisher uploads and rewrites them.

A Learning Asset Plan owns the requested visual purpose, exact prompt, and
authoritative input references. An external Visual Provider returns a bitmap
plus a result document. Registration preserves provider/model identity,
prompt, references, validation checks, workspace-relative output path, and
content hash without storing credentials.

The Field Manual Web profile supports `reading`, `workshop`, and `atlas`.
It defaults to paper tokens, provides a page-wide night theme, and always uses a
fixed light print theme. Core content, exercises, answer disclosures, sources,
and static fallbacks remain readable without JavaScript.

The seven Teaching Themes (see [teaching-themes.md](references/teaching-themes.md))
apply to Web Lesson and HTML PPT. WeChat Article uses independent Channel Themes
(see [wechat-rendering.md](references/wechat-rendering.md)). Theme selection
changes presentation only and never mutates Lesson Bundle content or learning
evidence.

## Publication

Only a validated, content-addressed artifact may be published. Persist every
remote identifier and state transition. Do not automatically replay a write
whose result is unknown. Redact secrets, tokens, and recipient identifiers from
diagnostics.
