---
"edge-pi": patch
"edge-pi-cli": patch
---

Fix OpenAI Codex request compatibility and simplify provider option handling.

- Add explicit Codex provider options (`instructions`, `store: false`) from CLI configuration.
- Expose `providerOptions` on `CodingAgentConfig` and remove `thinkingLevel` from `edge-pi` SDK config.
- Thread provider options through compaction and branch summarization model calls.
- Improve interactive stream error formatting to surface API status/body details.
