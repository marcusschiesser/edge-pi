---
"edge-pi": patch
"edge-pi-cli": patch
"edge-pi-examples": patch
"edge-pi-docs": patch
---

Integrate `SessionManager` with `CodingAgent` so session history is auto-restored and persisted during `generate()` and `stream()`. Simplify CLI session handling to rely on the agent integration, add session integration tests, and update session docs/examples.
