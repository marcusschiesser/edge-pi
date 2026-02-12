---
"edge-pi": patch 
"edge-pi-cli": patch
---

Move compaction orchestration into `CodingAgent` with optional config-driven auto/manual modes.

Add `CodingAgent` compaction APIs:
- `compaction` config in `CodingAgentConfig`
- `agent.compact()` for manual compaction
- `agent.setCompaction()` for runtime toggling
- compaction lifecycle callbacks (`onCompactionStart`, `onCompactionComplete`, `onCompactionError`)
- low-level compaction helpers are no longer exported from the package root

Update the CLI interactive mode to rely on agent-level compaction orchestration instead of duplicating orchestration logic.
