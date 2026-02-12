---
"edge-pi": patch
"edge-pi-cli": patch
---

Add structured SDK support for prompt skills and shared prompt-context types.

- `BuildSystemPromptOptions` now accepts `skills` in addition to `contextFiles`.
- Export shared `Skill` and `ContextFile` types from `edge-pi`.
- Move skill prompt formatting into the SDK system prompt builder.
- Update CLI wiring to pass loaded skills/context files as structured `systemPromptOptions` input.

Add a new SDK example for structured skills and update streaming examples to use `printStream`.
