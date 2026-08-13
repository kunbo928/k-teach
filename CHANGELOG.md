# k-teach

## 1.2.2

### Patch Changes

- 12fa3d2: Place generated Web, PPT, WeChat, and research artifacts in the nearest user-facing `main` directory, and keep PPT generation isolated from Web output.

## 1.2.1

### Patch Changes

- 60e9d72: Stop shipping OpenSpec/html-ppt provenance docs in the package and describe the Agent registry as K Teach's own.

## 1.2.0

### Minor Changes

- ada8b08: Deepen Generation Run behind `runGenerationRoute` so generate, diagnostic render, and preview share stage/validate/promote; give WeChat Article its own Channel Theme tokens and recipes instead of aliasing Teaching Themes, and record Design Profile as `field-manual` on WeChat manifests.
- 93c1e20: Make the Teaching Theme TypeScript catalog the single source for Web and PPT tokens/chrome, emit `teaching-themes.css` at build time, and share PPT theme CSS through the same module.

## 1.1.0

### Minor Changes

- 3ab5188: Align `k-teach init` with `npx skills add`: install a single canonical Skill copy under `.agents/skills/k-teach` and symlink each detected Agent to it; add `--yes`/`-y` (skip selection, install to all detected Agents) and `--copy` (independent copies instead of symlinks) flags; add WorkBuddy support (auto-detected via `.workbuddy`).

## 1.0.1

### Patch Changes

- 26ba305: Fix Windows CI crash in the preview runtime. The vite/chokidar file watcher aborted the process on Windows + Node 24 / libuv 2.x with a libuv `_wcsnicmp` assertion when a watched directory was removed or renamed mid-run (the "preview exits diagnostically when its temporary project root disappears" test). Vite now runs with its built-in NoopWatcher and the preview runtime watches the project root with a polling tree scan that holds no native fs handle, so deleting the project root can never crash the runner and CI passes on all three platforms.

## 1.0.0

### Major Changes

- 8668a74: Add resumable `generate` / `context` / `inspect` workflows with Context Packets, Semantic Plans, content-addressed caching, and staged artifact promotion. Require Presentation Briefs for PPT rendering and drop the legacy V1 publication contract migrations.

## 0.6.0

### Minor Changes

- 88fb48f: Bind a registered WeChat account as the project default during `k-teach init`, with explicit non-interactive account selection for multi-account setups and native Windows, macOS, and Linux user paths.

## 0.5.0

### Minor Changes

- f716aef: Add sequence diagram rendering, WeChat diagram rasterization for channel layouts, Publication Brief draft_delivery authorization, and uninterrupted WeChat draft/preview workflows.

## 0.4.0

### Minor Changes

- 1c51b98: Add goal-driven Presentation and Publication Brief workflows, a bundled Vite
  project preview, self-contained teaching/talk HTML presentations, independent
  WeChat Channel Themes with explicit proposal preview, and a safe multi-account
  WeChat registry with V2 artifact and publication-attempt contracts.

## 0.3.1

### Patch Changes

- 7f50037: Inject the CLI version from package.json at build time so --version and generatedBy match the published release.

## 0.3.0

### Minor Changes

- d3f4e8b: Ask for the intended output use when it is unclear, preserve the existing
  learning experience, keep WeChat layout native, and add a self-contained HTML
  PPT renderer with presenter notes, keyboard navigation, and manifests. Implement
  all seven Teaching Themes across Web, WeChat, and PPT output with per-Teach Web
  preferences and explicit channel selection.
