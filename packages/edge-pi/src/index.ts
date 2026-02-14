/**
 * edge-pi - Vercel AI SDK based coding agent.
 */

// Main agent
export { CodingAgent } from "./agent.js";
export {
	type BranchSummaryResult,
	collectEntriesForBranchSummary,
	type GenerateBranchSummaryOptions,
	generateBranchSummary,
} from "./compaction/branch-summarization.js";
// Compaction
export type {
	CompactionDetails,
	CompactionResult,
	CompactionSettings,
} from "./compaction/compaction.js";
export { estimateContextTokens, estimateTokens, shouldCompact } from "./compaction/token-estimation.js";
export type { ContextFile, Skill } from "./prompt-context.js";
export { createNodeRuntime } from "./runtime/node-runtime.js";
export type { EdgePiFs, EdgePiOs, EdgePiPath, EdgePiRuntime, ExecOptions, ExecResult } from "./runtime/types.js";
export { buildSessionContext, type SessionContext } from "./session/context.js";
// Session
export { SessionManager } from "./session/session-manager.js";
export type {
	BranchSummaryEntry,
	CompactionEntry,
	MessageEntry,
	ModelChangeEntry,
	SessionEntry,
	SessionHeader,
	SessionTreeNode,
} from "./session/types.js";
// System prompt
export {
	type BuildSystemPromptCallOptions,
	type BuildSystemPromptOptions,
	buildSystemPrompt,
} from "./system-prompt.js";
export { createBashTool } from "./tools/bash.js";
export { createEditTool } from "./tools/edit.js";
export { createFindTool } from "./tools/find.js";
export { createGrepTool } from "./tools/grep.js";
// Tools
export { createAllTools, createCodingTools, createReadOnlyTools } from "./tools/index.js";
export { createLsTool } from "./tools/ls.js";
export { createReadTool } from "./tools/read.js";
export { createWriteTool } from "./tools/write.js";
// Re-export key Vercel AI types for convenience
export type {
	Agent,
	AgentCallParameters,
	AgentStreamParameters,
	AssistantModelMessage,
	CodingAgentConfig,
	CompactionConfig,
	GenerateTextResult,
	LanguageModel,
	LanguageModelUsage,
	ModelMessage,
	StepResult,
	StopCondition,
	StreamTextResult,
	SystemModelMessage,
	ToolModelMessage,
	ToolSet,
	UserModelMessage,
} from "./types.js";
