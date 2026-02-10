/**
 * CodingAgent - wraps Vercel AI SDK's ToolLoopAgent.
 *
 * Implements the Vercel AI SDK Agent interface, providing generate() and
 * stream() methods with the same signatures. Takes a LanguageModel directly
 * (no model factory). Uses streamText/generateText as the core agent loop.
 *
 * The agent runs without an artificial step limit — it continues
 * until the model naturally stops (no more tool calls). This matches
 * the behavior of the coding-agent-sdk, which loops indefinitely
 * as long as the model wants to make tool calls.
 */

import {
	type Agent,
	type AgentCallParameters,
	type AgentStreamParameters,
	type GenerateTextResult,
	type ModelMessage,
	type StreamTextResult,
	ToolLoopAgent,
	type ToolSet,
} from "ai";
import type { SessionManager } from "./session/session-manager.js";
import type { BuildSystemPromptOptions } from "./system-prompt.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { createAllTools, createCodingTools, createReadOnlyTools } from "./tools/index.js";
import type { CodingAgentConfig } from "./types.js";

/**
 * A stop condition that never triggers, allowing the agent to run
 * until the model naturally stops making tool calls.
 */
function neverStop(_options: { steps: unknown[] }): boolean {
	return false;
}

/**
 * CodingAgent wraps ToolLoopAgent and implements the Vercel AI SDK
 * Agent interface, providing generate() and stream() methods for
 * running coding tasks with tools.
 */
export class CodingAgent implements Agent<never, ToolSet> {
	readonly version = "agent-v1" as const;
	private config: CodingAgentConfig;
	private _messages: ModelMessage[] = [];
	private _sessionManager: SessionManager | undefined;
	private steeringQueue: ModelMessage[] = [];
	private abortController: AbortController | null = null;

	constructor(config: CodingAgentConfig) {
		this.config = { ...config };
		if (config.sessionManager) {
			this._sessionManager = config.sessionManager;
			const context = this._sessionManager.buildSessionContext();
			this._messages = context.messages;
		}
	}

	/** The id of the agent. */
	get id(): string | undefined {
		return undefined;
	}

	/** The tools that the agent can use. */
	get tools(): ToolSet {
		return this.getTools();
	}

	/** Current conversation messages */
	get messages(): ReadonlyArray<ModelMessage> {
		return this._messages;
	}

	/** Set conversation messages (e.g., when restoring from session). Does NOT write to the session. */
	setMessages(messages: ModelMessage[]): void {
		this._messages = [...messages];
	}

	/** Get the current session manager (or undefined). */
	get sessionManager(): SessionManager | undefined {
		return this._sessionManager;
	}

	/** Set (or replace) the session manager. Auto-restores messages from the new session. */
	set sessionManager(sm: SessionManager | undefined) {
		this._sessionManager = sm;
		if (sm) {
			const context = sm.buildSessionContext();
			this._messages = context.messages;
		}
	}

	/** Inject a message between steps via prepareStep */
	steer(message: ModelMessage): void {
		this.steeringQueue.push(message);
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

		// Merge additional tools
		if (this.config.tools) {
			tools = { ...tools, ...this.config.tools };
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
			stopWhen: this.config.stopWhen ?? neverStop,
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
	 * Non-streaming execution (implements Agent.generate).
	 * Runs the agent loop to completion and returns the GenerateTextResult.
	 */
	async generate(options: AgentCallParameters<never, ToolSet>): Promise<GenerateTextResult<ToolSet, never>> {
		this.abortController = new AbortController();
		const signal = options.abortSignal
			? mergeAbortSignals(options.abortSignal, this.abortController.signal)
			: this.abortController.signal;

		// Build input messages
		const previousMessageCount = this._messages.length;
		const inputMessages = this.buildInputMessages(options);
		this._messages = inputMessages;

		const agent = this.createAgent();

		const result = await agent.generate({
			messages: inputMessages,
			abortSignal: signal,
			timeout: options.timeout,
			onStepFinish: options.onStepFinish,
		});

		// Update messages with the result: input messages + response messages
		const responseMessages = result.response.messages as ModelMessage[];
		this._messages = [...inputMessages, ...responseMessages];

		// Auto-persist to session
		if (this._sessionManager) {
			for (let i = previousMessageCount; i < inputMessages.length; i++) {
				this._sessionManager.appendMessage(inputMessages[i]);
			}
			for (const msg of responseMessages) {
				this._sessionManager.appendMessage(msg);
			}
		}

		return result;
	}

	/**
	 * Streaming execution (implements Agent.stream).
	 * Returns Vercel AI StreamTextResult directly.
	 */
	async stream(options: AgentStreamParameters<never, ToolSet>): Promise<StreamTextResult<ToolSet, never>> {
		this.abortController = new AbortController();
		const signal = options.abortSignal
			? mergeAbortSignals(options.abortSignal, this.abortController.signal)
			: this.abortController.signal;

		// Build input messages
		const previousMessageCount = this._messages.length;
		const inputMessages = this.buildInputMessages(options);
		this._messages = inputMessages;

		const agent = this.createAgent();

		const result = await agent.stream({
			messages: inputMessages,
			abortSignal: signal,
			timeout: options.timeout,
			onStepFinish: options.onStepFinish,
			experimental_transform: options.experimental_transform,
		});

		// Auto-persist when stream is fully consumed
		Promise.resolve(result.response)
			.then((response) => {
				const responseMessages = response.messages as ModelMessage[];
				this._messages = [...inputMessages, ...responseMessages];

				if (this._sessionManager) {
					for (let i = previousMessageCount; i < inputMessages.length; i++) {
						this._sessionManager.appendMessage(inputMessages[i]);
					}
					for (const msg of responseMessages) {
						this._sessionManager.appendMessage(msg);
					}
				}
			})
			.catch(() => {
				// Stream error/abort — don't persist
			});

		return result;
	}

	/** Build input messages from AgentCallParameters */
	private buildInputMessages(options: AgentCallParameters<never, ToolSet>): ModelMessage[] {
		if ("messages" in options && options.messages) {
			return [...this._messages, ...options.messages];
		}

		if ("prompt" in options && options.prompt !== undefined) {
			if (typeof options.prompt === "string") {
				return [
					...this._messages,
					{ role: "user" as const, content: [{ type: "text" as const, text: options.prompt }] },
				];
			}
			// prompt is Array<ModelMessage>
			return [...this._messages, ...options.prompt];
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
