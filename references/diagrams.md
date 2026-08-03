# Deterministic diagrams

Use a Diagram when spatial structure helps the learner understand a process,
relationship, or lifecycle. Keep the spec beside the Lesson Bundle under
`media/diagrams/`; keep rendered files under `.k-teach/output/diagrams/`.
Rendered files are derived assets and never become the content authority.

## Diagram Spec

```yaml
schema_version: 1
id: request-flow
title: 请求处理流程
description: 从收到请求到返回响应的主流程。
kind: flow
direction: top-to-bottom
nodes:
  - id: receive
    label: 收到请求
    role: start
  - id: validate
    label: 验证输入
    role: decision
edges:
  - from: receive
    to: validate
```

Supported `kind` values are `flow`, `relationship`, `state`, and `sequence`. Supported
directions are `top-to-bottom` and `left-to-right`. Node ids must be unique
lowercase slugs. Every edge endpoint must name an existing node.

For `sequence`, nodes are participants in left-to-right order and edges are
messages in chronological order. The renderer gives each participant a header
and lifeline, and draws every edge as a labelled directional message. Do not
model a sequence diagram as a wide `flow`; that becomes unreadable in narrow
channel layouts.

Use node `detail` for a short explanation. Labels and details wrap inside
their nodes; keep each concise enough to remain readable on mobile. Use semantic roles:
`start`, `end`, `decision`, `step`, `source`, `artifact`, or `state`. Do not
encode meaning only with color.

## Render

Run:

```sh
k-teach render diagram path/to/spec.yaml
```

Pass `--output <directory>` when the default
`.k-teach/output/diagrams/` is not suitable. One render writes:

- `<id>.svg`, with a responsive `viewBox`, semantic title and description;
- `<id>@2x.png`, derived deterministically for channels that cannot use SVG;
- `<id>.manifest.json`, with the source hash, renderer version, Field Manual
  profile, scale, and file list.

The renderer uses the Field Manual paper, ink, line, muted, note, and accent
roles. SVG color declarations expose `--kt-diagram-*` custom properties with
offline fallbacks and include a restrained night-mode variant.
