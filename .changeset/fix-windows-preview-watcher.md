---
"k-teach": patch
---

Fix Windows CI crash in the preview runtime. The vite/chokidar file watcher aborted the process on Windows + Node 24 / libuv 2.x with a libuv `_wcsnicmp` assertion when a watched directory was removed or renamed mid-run (the "preview exits diagnostically when its temporary project root disappears" test). The preview runtime now watches the project root with the native `node:fs` `fs.watch` (vite runs with its built-in NoopWatcher), which emits an `error` event instead of aborting, so the runner survives and CI passes on all three platforms.
