---
"edge-pi": major
"edge-pi-cli": major
---

Refactor runtime path handling around explicit workspace roots and make runtime usage explicit.

## edge-pi

- Add `runtime.rootdir` and `runtime.resolveWorkspacePath(...)` to unify workspace path resolution.
- Require explicit runtime injection for `CodingAgent` and tool factories.
- Keep `CodingAgent` and tools on the root entrypoint, but move `SessionManager` to `edge-pi/session`.
- Add explicit `./session` export and runtime-specific options for `createWebContainerRuntime` and `createVercelSandboxRuntime`.
- Improve cross-runtime path normalization for generated paths like `home/project/...` and duplicated absolute prefixes.

### Breaking changes

- `CodingAgentConfig.runtime` is now required.
- Tool factory options now require `runtime`.
- `SessionManager` is no longer exported from `edge-pi`; import from `edge-pi/session`.
- Runtime contract changed from `os.homedir()`-based defaults to `rootdir` + `resolveWorkspacePath(...)`.

## edge-pi-cli

- Update CLI to the new edge-pi runtime/session API (`createNodeRuntime` + `edge-pi/session`).

