/**
 * Core types for edge-pi.
 *
 * Re-exports Vercel AI types and defines package-specific types.
 */

import type {
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
import type { BuildSystemPromptOptions } from "./system-prompt.js";

// Re-export Vercel AI types consumers need
export type {
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
	/** Extra tools to merge in */
	extraTools?: ToolSet;
	/** Thinking level for reasoning models */
	thinkingLevel?: ThinkingLevel;
}

/**
 * Options for a prompt/stream call.
 */
export interface PromptOptions {
	/** Simple text prompt (creates a UserModelMessage) */
	prompt?: string;
	/** Or provide full messages */
	messages?: ModelMessage[];
	/** Abort signal for cancellation */
	abortSignal?: AbortSignal;
}

/**
 * Result from a non-streaming prompt call.
 */
export interface PromptResult {
	/** Generated text from the assistant */
	text: string;
	/** All messages (input + generated) */
	messages: ModelMessage[];
	/** Total usage across all steps */
	totalUsage: LanguageModelUsage;
	/** Number of steps executed */
	stepCount: number;
}
