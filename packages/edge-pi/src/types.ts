/**
 * Core types for edge-pi.
 *
 * Re-exports Vercel AI types and defines package-specific types.
 */

import type { JSONValue } from "@ai-sdk/provider";
import type {
	Agent,
	AgentCallParameters,
	AgentStreamParameters,
	AssistantModelMessage,
	FilePart,
	GenerateTextResult,
	LanguageModel,
	LanguageModelUsage,
	ModelMessage,
	StepResult,
	StopCondition,
	StreamTextResult,
	SystemModelMessage,
	TextPart,
	Tool,
	ToolCallPart,
	ToolModelMessage,
	ToolResultPart,
	ToolSet,
	UserModelMessage,
} from "ai";
import type { CompactionResult, CompactionSettings } from "./compaction/compaction.js";
import type { EdgePiRuntime } from "./runtime/types.js";
import type { SessionContext } from "./session/context.js";
import type { SessionEntry } from "./session/types.js";
import type { BuildSystemPromptOptions } from "./system-prompt.js";

// Re-export Vercel AI types consumers need
export type {
	Agent,
	AgentCallParameters,
	AgentStreamParameters,
	AssistantModelMessage,
	FilePart,
	GenerateTextResult,
	LanguageModel,
	LanguageModelUsage,
	ModelMessage,
	StepResult,
	StopCondition,
	StreamTextResult,
	SystemModelMessage,
	TextPart,
	Tool,
	ToolCallPart,
	ToolModelMessage,
	ToolResultPart,
	ToolSet,
	UserModelMessage,
};
export { generateId, tool } from "ai";

/**
 * Thinking level for model reasoning.
 */
/**
 * Configuration for automatic and manual context compaction.
 */
export interface CompactionConfig {
	/** The model's context window size in tokens. */
	contextWindow: number;
	/**
	 * 'auto' = check after generate/stream, 'manual' = only agent.compact().
	 */
	mode: "auto" | "manual";
	/** Optional separate model for summarization. Defaults to agent model. */
	model?: LanguageModel;
	/** Override default compaction settings (reserveTokens, keepRecentTokens). */
	settings?: Partial<Omit<CompactionSettings, "enabled">>;
	/** Called when compaction starts. */
	onCompactionStart?: () => void;
	/** Called when compaction completes successfully. */
	onCompactionComplete?: (result: CompactionResult) => void;
	/** Called when compaction fails (including abort). */
	onCompactionError?: (error: Error) => void;
}

export interface SessionManagerLike {
	buildSessionContext(): SessionContext;
	appendMessage(message: ModelMessage): string;
	appendCompaction<T = unknown>(summary: string, firstKeptEntryId: string, tokensBefore: number, details?: T): string;
	getBranch(fromId?: string): SessionEntry[];
	getEntries(): SessionEntry[];
	getSessionFile(): string | undefined;
}

/**
 * Configuration for the CodingAgent.
 */
export interface CodingAgentConfig {
	/** Vercel AI LanguageModel passed directly by consumer */
	model: LanguageModel;
	/** Working directory. Relative values are resolved from runtime.rootdir. Default: runtime.rootdir. */
	cwd?: string;
	/**
	 * Optional stop condition(s) for the agent loop.
	 * When provided, the agent stops when any condition returns true.
	 * When omitted, the agent runs until the model naturally stops making tool calls.
	 *
	 * Use the Vercel AI SDK helpers like `stepCountIs()` and `hasToolCall()`,
	 * or provide a custom `StopCondition<ToolSet>` function.
	 *
	 * @example
	 * ```ts
	 * import { stepCountIs } from "ai";
	 * const agent = new CodingAgent({ model, runtime, stopWhen: stepCountIs(10) });
	 * ```
	 */
	stopWhen?: StopCondition<ToolSet> | Array<StopCondition<ToolSet>>;
	/** Configure the system prompt builder */
	systemPromptOptions?: BuildSystemPromptOptions;
	/** Which tool set to use. Default: "coding" */
	toolSet?: "coding" | "readonly" | "all";
	/** Additional tools to merge in */
	tools?: ToolSet;
	/** Runtime adapter for filesystem, shell, path and OS operations. Required. */
	runtime: EdgePiRuntime;
	/** Optional provider-specific options forwarded to the model call. */
	providerOptions?: Record<string, Record<string, JSONValue>>;
	/**
	 * Optional session manager for automatic message persistence.
	 * When provided, messages are auto-restored from the session on construction
	 * and auto-persisted after generate() and stream() calls.
	 */
	sessionManager?: SessionManagerLike;
	/** Optional compaction configuration for automatic/manual context compaction. */
	compaction?: CompactionConfig;
}
