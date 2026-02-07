/**
 * Core types for edge-pi.
 *
 * Re-exports Vercel AI types and defines package-specific types.
 */

// Re-export Vercel AI types consumers need
export type {
	AssistantModelMessage,
	FilePart,
	GenerateTextResult,
	LanguageModel,
	LanguageModelUsage,
	ModelMessage,
	StepResult,
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
	model: import("ai").LanguageModel;
	/** Working directory. Default: process.cwd() */
	cwd?: string;
	/** Maximum steps per agent loop. Default: 10 */
	maxSteps?: number;
	/** Override full system prompt */
	systemPrompt?: string;
	/** Or configure the system prompt builder */
	systemPromptOptions?: import("./system-prompt.js").BuildSystemPromptOptions;
	/** Which tool set to use. Default: "coding" */
	toolSet?: "coding" | "readonly" | "all";
	/** Extra tools to merge in */
	extraTools?: import("ai").ToolSet;
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
	messages?: import("ai").ModelMessage[];
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
	messages: import("ai").ModelMessage[];
	/** Total usage across all steps */
	totalUsage: import("ai").LanguageModelUsage;
	/** Number of steps executed */
	stepCount: number;
}
