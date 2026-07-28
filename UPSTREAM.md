# Vendored Agent Integration provenance

- Upstream: https://github.com/Fission-AI/OpenSpec
- Commit: `fc886af7f93068482bbf2c66fd1eb76b40c6a22f`
- Vendored: 2026-07-28
- License: MIT; see `THIRD_PARTY_NOTICES.md`

## Source boundary

K Teach adapts the Agent registry, detection, selection, Skill generation,
version marking, update, and owned-path cleanup model from:

- `src/core/config.ts`
- `src/core/available-tools.ts`
- `src/core/init.ts`
- `src/core/update.ts`
- `src/core/shared/skill-generation.ts`
- `src/core/command-generation/`

## Local differences

- K Teach generates one canonical `k-teach` Skill rather than OpenSpec
  workflow Skills.
- The durable project directory is `k-teach/`.
- Generated Skills call the globally installed `k-teach` CLI through `PATH`.
- K Teach does not vendor OpenSpec schemas, workflows, artifacts, or domain
  commands and has no runtime dependency on `@fission-ai/openspec`.
