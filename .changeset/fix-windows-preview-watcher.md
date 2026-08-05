---
"k-teach": patch
---

Fix Windows CI crash in the preview runtime. The vite/chokidar file watcher aborted the process on Windows + Node 24 / libuv 2.x with a libuv `_wcsnicmp` assertion when a watched directory was removed or renamed mid-run (the "preview exits diagnostically when its temporary project root disappears" test). Vite now runs with its built-in NoopWatcher and the preview runtime watches the project root with a polling tree scan that holds no native fs handle, so deleting the project root can never crash the runner and CI passes on all three platforms.
