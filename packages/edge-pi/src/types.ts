/**
 * Core types for edge-pi.
 *
 * Re-exports Vercel AI types and defines package-specific types.
 */

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
import type { SessionManager } from "./session/session-manager.js";
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
export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high";

/**
 * Configuration for the CodingAgent.
 */
export interface CodingAgentConfig {
	/** Vercel AI LanguageModel passed directly by consumer */
	model: LanguageModel;
	/** Working directory. Default: process.cwd() */
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
	 * const agent = new CodingAgent({ model, stopWhen: stepCountIs(10) });
	 * ```
	 */
	stopWhen?: StopCondition<ToolSet> | Array<StopCondition<ToolSet>>;
	/** Override full system prompt */
	systemPrompt?: string;
	/** Or configure the system prompt builder */
	systemPromptOptions?: BuildSystemPromptOptions;
	/** Which tool set to use. Default: "coding" */
	toolSet?: "coding" | "readonly" | "all";
	/** Additional tools to merge in */
	tools?: ToolSet;
	/** Thinking level for reasoning models */
	thinkingLevel?: ThinkingLevel;
	/**
	 * Optional session manager for automatic message persistence.
	 * When provided, messages are auto-restored from the session on construction
	 * and auto-persisted after generate() and stream() calls.
	 */
	sessionManager?: SessionManager;
}
