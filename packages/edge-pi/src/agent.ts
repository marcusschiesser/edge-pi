/**
 * CodingAgent - wraps Vercel AI SDK's ToolLoopAgent.
 *
 * Takes a LanguageModel directly (no model factory).
 * Uses streamText/generateText with stepCountIs as the core agent loop.
 */

import {
	type GenerateTextResult,
	type ModelMessage,
	type StreamTextResult,
	stepCountIs,
	ToolLoopAgent,
	type ToolSet,
} from "ai";
import { type BuildSystemPromptOptions, buildSystemPrompt } from "./system-prompt.js";
import { createAllTools, createCodingTools, createReadOnlyTools } from "./tools/index.js";
import type { CodingAgentConfig, PromptOptions, PromptResult } from "./types.js";

/**
 * CodingAgent wraps ToolLoopAgent and provides a simple interface
 * for running coding tasks with tools.
 */
export class CodingAgent {
	private config: Required<Pick<CodingAgentConfig, "model" | "maxSteps">> & CodingAgentConfig;
	private _messages: ModelMessage[] = [];
	private steeringQueue: ModelMessage[] = [];
	private followUpQueue: ModelMessage[] = [];
	private abortController: AbortController | null = null;

	constructor(config: CodingAgentConfig) {
		this.config = {
			...config,
			maxSteps: config.maxSteps ?? 10,
		};
	}

	/** Current conversation messages */
	get messages(): ReadonlyArray<ModelMessage> {
		return this._messages;
	}

	/** Set conversation messages (e.g., when restoring from session) */
	setMessages(messages: ModelMessage[]): void {
		this._messages = [...messages];
	}

	/** Inject a message between steps via prepareStep */
	steer(message: ModelMessage): void {
		this.steeringQueue.push(message);
	}

	/** Inject a message after loop completes (triggers another loop) */
	followUp(message: ModelMessage): void {
		this.followUpQueue.push(message);
	}

	/** Abort the current operation */
	abort(): void {
		this.abortController?.abort();
	}

	/** Build the system prompt based on config */
	private getSystemPrompt(): string {
		if (this.config.systemPrompt) {
			return this.config.systemPrompt;
		}

		const toolSetType = this.config.toolSet ?? "coding";
		const selectedTools =
			toolSetType === "coding"
				? ["read", "bash", "edit", "write"]
				: toolSetType === "readonly"
					? ["read", "grep", "find", "ls"]
					: ["read", "bash", "edit", "write", "grep", "find", "ls"];

		const opts: BuildSystemPromptOptions = {
			...this.config.systemPromptOptions,
			selectedTools,
			cwd: this.config.cwd ?? process.cwd(),
		};

		return buildSystemPrompt(opts);
	}

	/** Build the tools based on config */
	private getTools(): ToolSet {
		const cwd = this.config.cwd ?? process.cwd();
		const toolSetType = this.config.toolSet ?? "coding";

		let tools: ToolSet;
		switch (toolSetType) {
			case "coding":
				tools = createCodingTools(cwd);
				break;
			case "readonly":
				tools = createReadOnlyTools(cwd);
				break;
			case "all":
				tools = createAllTools(cwd);
				break;
		}

		// Merge extra tools
		if (this.config.extraTools) {
			tools = { ...tools, ...this.config.extraTools };
		}

		return tools;
	}

	/** Build provider options for thinking levels */
	private getProviderOptions(): Record<string, Record<string, any>> | undefined {
		const level = this.config.thinkingLevel;
		if (!level || level === "off") return undefined;

		// Map thinking levels to budget tokens
		const budgetMap: Record<string, number> = {
			minimal: 1024,
			low: 4096,
			medium: 10240,
			high: 32768,
		};

		const budget = budgetMap[level];
		if (!budget) return undefined;

		return {
			anthropic: { thinking: { type: "enabled", budgetTokens: budget } },
		};
	}

	/** Create a ToolLoopAgent for this call */
	private createAgent(): ToolLoopAgent<never, ToolSet> {
		const tools = this.getTools();
		const instructions = this.getSystemPrompt();

		return new ToolLoopAgent({
			model: this.config.model,
			instructions,
			tools,
			stopWhen: stepCountIs(this.config.maxSteps),
			providerOptions: this.getProviderOptions(),
			prepareStep: ({ steps }) => {
				// Drain steering queue
				if (this.steeringQueue.length > 0) {
					const steeringMsgs = this.steeringQueue.splice(0);
					const lastStep = steps[steps.length - 1];
					if (lastStep) {
						return {
							messages: [...steeringMsgs],
						};
					}
				}
				return {};
			},
		});
	}

	/**
	 * Non-streaming execution.
	 * Runs the agent loop, handles follow-ups, returns final result.
	 */
	async prompt(options: PromptOptions): Promise<PromptResult> {
		this.abortController = new AbortController();
		const signal = options.abortSignal
			? mergeAbortSignals(options.abortSignal, this.abortController.signal)
			: this.abortController.signal;

		// Build input messages
		const inputMessages = this.buildInputMessages(options);
		this._messages = inputMessages;

		const agent = this.createAgent();
		let totalSteps = 0;

		// Run agent loop (with follow-up support)
		let currentMessages = [...inputMessages];
		let lastResult: GenerateTextResult<ToolSet, any>;

		do {
			lastResult = await agent.generate({
				messages: currentMessages,
				abortSignal: signal,
			});

			totalSteps += lastResult.steps.length;

			// Update messages with the result: input messages + response messages
			const responseMessages = lastResult.response.messages as ModelMessage[];
			this._messages = [...currentMessages, ...responseMessages];
			currentMessages = this._messages;

			// Check for follow-ups
			if (this.followUpQueue.length > 0) {
				const followUps = this.followUpQueue.splice(0);
				currentMessages = [...currentMessages, ...followUps];
				this._messages = currentMessages;
			} else {
				break;
			}
			// biome-ignore lint/correctness/noConstantCondition: follow-up loop with break
		} while (true);

		return {
			text: lastResult.text,
			messages: this._messages,
			totalUsage: lastResult.totalUsage,
			stepCount: totalSteps,
		};
	}

	/**
	 * Streaming execution.
	 * Returns Vercel AI StreamTextResult directly.
	 */
	async stream(options: PromptOptions): Promise<StreamTextResult<ToolSet, any>> {
		this.abortController = new AbortController();
		const signal = options.abortSignal
			? mergeAbortSignals(options.abortSignal, this.abortController.signal)
			: this.abortController.signal;

		// Build input messages
		const inputMessages = this.buildInputMessages(options);
		this._messages = inputMessages;

		const agent = this.createAgent();

		const result = await agent.stream({
			messages: inputMessages,
			abortSignal: signal,
		});

		return result;
	}

	/** Build input messages from PromptOptions */
	private buildInputMessages(options: PromptOptions): ModelMessage[] {
		if (options.messages) {
			return [...this._messages, ...options.messages];
		}

		if (options.prompt) {
			return [
				...this._messages,
				{ role: "user" as const, content: [{ type: "text" as const, text: options.prompt }] },
			];
		}

		return [...this._messages];
	}
}

/**
 * Merge two abort signals into one.
 */
function mergeAbortSignals(signal1: AbortSignal, signal2: AbortSignal): AbortSignal {
	const controller = new AbortController();

	const abort = () => controller.abort();

	if (signal1.aborted || signal2.aborted) {
		controller.abort();
		return controller.signal;
	}

	signal1.addEventListener("abort", abort, { once: true });
	signal2.addEventListener("abort", abort, { once: true });

	return controller.signal;
}
