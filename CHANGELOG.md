# k-teach

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
