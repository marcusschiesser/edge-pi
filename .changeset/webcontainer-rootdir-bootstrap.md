---
"edge-pi": patch
---

Fix `createWebContainerRuntime` to ensure the configured `rootdir` exists before runtime operations.

- Bootstrap `rootdir` once via `mkdir(..., { recursive: true })` inside runtime creation flow.
- Keep `fs.writeFile` focused on writing files (no implicit parent directory creation).
- Add tests asserting rootdir bootstrap before `writeFile` and `exec`.
