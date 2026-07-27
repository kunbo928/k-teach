# Core contracts

## Authority

The Learning Workspace owns persistent state. A Lesson Bundle is the only
authoritative source for one lesson. Design Profiles, rendered artifacts, and
publication attempts are derived records and must never silently write back.

## Lesson Bundle

```text
lessons/<lesson-id>/
├── lesson.yaml
├── lesson.md
├── exercises/
└── media/
```

`lesson.yaml` identifies the lesson, revision, mission, objectives, sources,
composition mode, and asset plan. `lesson.md` contains semantic teaching
content. Exercises and media remain addressable inputs rather than embedded
channel output.

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

## Publication

Only a validated, content-addressed artifact may be published. Persist every
remote identifier and state transition. Do not automatically replay a write
whose result is unknown. Redact secrets, tokens, and recipient identifiers from
diagnostics.
