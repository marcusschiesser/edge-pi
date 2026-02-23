---
"edge-pi": minor
---

Make `exec` optional on `EdgePiRuntime`; add `createMemoryRuntime`.

- `EdgePiRuntime.exec` is now an optional property — runtimes without shell support no longer need a throwing stub.
- The default `"coding"` toolset automatically adapts: `bash` is included when `exec` is present, `ls` when it is not. `grep` and `find` are likewise gated on `exec` in the `"readonly"` and `"all"` toolsets.
- New `createMemoryRuntime({ initialFiles? })` export: an in-memory runtime with a virtual filesystem, no disk access, and no exec. Useful for testing, sandboxed environments, and browser contexts.
