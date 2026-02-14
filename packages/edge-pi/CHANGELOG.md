# edge-pi

## [Unreleased]

### Breaking Changes

- Tool factory signatures now require an options object (`{ cwd, runtime? }`) instead of a plain `cwd` string.

### Added

- Added runtime abstraction (`EdgePiRuntime`) and Node default runtime factory (`createNodeRuntime`) for built-in tools.

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
