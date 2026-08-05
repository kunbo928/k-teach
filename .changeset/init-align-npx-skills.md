---
"k-teach": minor
---

Align `k-teach init` with `npx skills add`: install a single canonical Skill copy under `.agents/skills/k-teach` and symlink each detected Agent to it; add `--yes`/`-y` (skip selection, install to all detected Agents) and `--copy` (independent copies instead of symlinks) flags; add WorkBuddy support (auto-detected via `.workbuddy`).
