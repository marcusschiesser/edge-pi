# edge-pi

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
