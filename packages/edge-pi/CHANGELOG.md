# edge-pi

## 0.4.1

### Patch Changes

- [`e220086`](https://github.com/marcusschiesser/edge-pi/commit/e2200860d8370222c9b0a386c843e29deabcc240) Thanks [@marcusschiesser](https://github.com/marcusschiesser)! - Fix `createWebContainerRuntime` to ensure the configured `rootdir` exists before runtime operations.

  - Bootstrap `rootdir` once via `mkdir(..., { recursive: true })` inside runtime creation flow.
  - Keep `fs.writeFile` focused on writing files (no implicit parent directory creation).
  - Add tests asserting rootdir bootstrap before `writeFile` and `exec`.

## 0.4.0

### Minor Changes

- [#35](https://github.com/marcusschiesser/edge-pi/pull/35) [`dbc450b`](https://github.com/marcusschiesser/edge-pi/commit/dbc450b3613fd0d112bd40f036383dc4fcd2879f) Thanks [@marcusschiesser](https://github.com/marcusschiesser)! - Refactor runtime path handling around explicit workspace roots and make runtime usage explicit.

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

## 0.3.1

### Patch Changes

- [#33](https://github.com/marcusschiesser/edge-pi/pull/33) [`040a847`](https://github.com/marcusschiesser/edge-pi/commit/040a8472d3847df4599aa34454bd99e52b743a77) Thanks [@marcusschiesser](https://github.com/marcusschiesser)! - Add a new Vercel Sandbox runtime adapter via `createVercelSandboxRuntime`, including a dedicated `edge-pi/vercel-sandbox` export.

## 0.3.0

### Minor Changes

- [#32](https://github.com/marcusschiesser/edge-pi/pull/32) [`51d7916`](https://github.com/marcusschiesser/edge-pi/commit/51d79168d4263a4cff2a0ec1288f6615c5a213d5) Thanks [@marcusschiesser](https://github.com/marcusschiesser)! - Merge WebContainer runtime support into `edge-pi` and expose it via `edge-pi/webcontainer`, replacing the separate `edge-pi-webcontainer` workspace package.

### Patch Changes

- [`17f4aac`](https://github.com/marcusschiesser/edge-pi/commit/17f4aacd3893a851bca9652d8e9877d0e3f4a8fb) Thanks [@marcusschiesser](https://github.com/marcusschiesser)! - Restore detailed built-in tool prompt descriptions for `bash`, `find`, and `grep` in the edge-pi SDK.

## 0.2.0

### Minor Changes

- [#29](https://github.com/marcusschiesser/edge-pi/pull/29) [`5cca491`](https://github.com/marcusschiesser/edge-pi/commit/5cca491d5fee0c93fd1755188b24ebc2fffd63b3) Thanks [@marcusschiesser](https://github.com/marcusschiesser)! - Add runtime abstraction support across `edge-pi` tool factories and export `createNodeRuntime` plus runtime types.

  Add the new `edge-pi-webcontainer` package for running `edge-pi` tools in browser/WebContainer environments.

  Update examples with a Vite browser agent demo and structured skills usage notes.

## 0.1.6

### Patch Changes

- [#24](https://github.com/marcusschiesser/edge-pi/pull/24) [`0ebc242`](https://github.com/marcusschiesser/edge-pi/commit/0ebc24246e8e5d43d35dc595dc5e88214644a147) Thanks [@marcusschiesser](https://github.com/marcusschiesser)! - Add structured SDK support for prompt skills and shared prompt-context types.

  - `BuildSystemPromptOptions` now accepts `skills` in addition to `contextFiles`.
  - Export shared `Skill` and `ContextFile` types from `edge-pi`.
  - Move skill prompt formatting into the SDK system prompt builder.
  - Update CLI wiring to pass loaded skills/context files as structured `systemPromptOptions` input.

  Add a new SDK example for structured skills and update streaming examples to use `printStream`.

## 0.1.5

### Patch Changes

- [#21](https://github.com/marcusschiesser/edge-pi/pull/21) [`3e1fec6`](https://github.com/marcusschiesser/edge-pi/commit/3e1fec69fe72d09e30bfaa82946b8e930035336a) Thanks [@marcusschiesser](https://github.com/marcusschiesser)! - Move compaction orchestration into `CodingAgent` with optional config-driven auto/manual modes.

  Add `CodingAgent` compaction APIs:

  - `compaction` config in `CodingAgentConfig`
  - `agent.compact()` for manual compaction
  - `agent.setCompaction()` for runtime toggling
  - compaction lifecycle callbacks (`onCompactionStart`, `onCompactionComplete`, `onCompactionError`)
  - low-level compaction helpers are no longer exported from the package root

  Update the CLI interactive mode to rely on agent-level compaction orchestration instead of duplicating orchestration logic.

## 0.1.4

### Patch Changes

- [`f506424`](https://github.com/marcusschiesser/edge-pi/commit/f506424de1c5cc47abb9eb496f94900054ca194e) Thanks [@marcusschiesser](https://github.com/marcusschiesser)! - Fix OpenAI Codex request compatibility and simplify provider option handling.

  - Add explicit Codex provider options (`instructions`, `store: false`) from CLI configuration.
  - Expose `providerOptions` on `CodingAgentConfig` and remove `thinkingLevel` from `edge-pi` SDK config.
  - Thread provider options through compaction and branch summarization model calls.
  - Improve interactive stream error formatting to surface API status/body details.

## 0.1.3

### Patch Changes

- [`0cc3b76`](https://github.com/marcusschiesser/edge-pi/commit/0cc3b76233406325529fb8ad10e9e34282306a99) Thanks [@marcusschiesser](https://github.com/marcusschiesser)! - Integrate `SessionManager` with `CodingAgent` so session history is auto-restored and persisted during `generate()` and `stream()`. Simplify CLI session handling to rely on the agent integration, add session integration tests, and update session docs/examples.

- [`996b301`](https://github.com/marcusschiesser/edge-pi/commit/996b301a4a93ddc93c077c3102a997fe9cb41b38) Thanks [@marcusschiesser](https://github.com/marcusschiesser)! - Add changeset for release
