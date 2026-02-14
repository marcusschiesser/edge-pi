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
import {
	type CompactionResult,
	compact,
	DEFAULT_COMPACTION_SETTINGS,
	prepareCompaction,
} from "./compaction/compaction.js";
import { estimateContextTokens, shouldCompact } from "./compaction/token-estimation.js";
import type { SessionManager } from "./session/session-manager.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { createAllTools, createCodingTools, createReadOnlyTools } from "./tools/index.js";
import type { CodingAgentConfig, CompactionConfig } from "./types.js";

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
	private isCompacting = false;

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

	/** Current compaction configuration (if configured). */
	get compaction(): CompactionConfig | undefined {
		return this.config.compaction;
	}

	/** Update compaction configuration at runtime. */
	setCompaction(compaction: CompactionConfig | undefined): void {
		this.config.compaction = compaction;
	}

	/** Inject a message between steps via prepareStep */
	steer(message: ModelMessage): void {
		this.steeringQueue.push(message);
	}

	/** Abort the current operation */
	abort(): void {
		this.abortController?.abort();
	}

	/** Trigger compaction manually, skipping threshold checks. */
	async compact(): Promise<CompactionResult | undefined> {
		const compactionConfig = this.config.compaction;
		if (!compactionConfig) {
			throw new Error("Compaction not configured");
		}

		this.abortController = new AbortController();
		return this.runCompaction(compactionConfig, this.abortController.signal, true);
	}

	/** Build the system prompt based on config */
	private getSystemPrompt(): string {
		const toolSetType = this.config.toolSet ?? "coding";
		const cwd = this.resolveCwd();
		const selectedTools =
			toolSetType === "coding"
				? ["read", "bash", "edit", "write"]
				: toolSetType === "readonly"
					? ["read", "grep", "find", "ls"]
					: ["read", "bash", "edit", "write", "grep", "find", "ls"];

		return buildSystemPrompt(this.config.systemPromptOptions, {
			selectedTools,
			cwd,
		});
	}

	/** Build the tools based on config */
	private getTools(): ToolSet {
		const cwd = this.resolveCwd();
		const toolSetType = this.config.toolSet ?? "coding";

		let tools: ToolSet;
		switch (toolSetType) {
			case "coding":
				tools = createCodingTools({ cwd, runtime: this.config.runtime });
				break;
			case "readonly":
				tools = createReadOnlyTools({ cwd, runtime: this.config.runtime });
				break;
			case "all":
				tools = createAllTools({ cwd, runtime: this.config.runtime });
				break;
		}

		// Merge additional tools
		if (this.config.tools) {
			tools = { ...tools, ...this.config.tools };
		}

		return tools;
	}

	private resolveCwd(): string {
		if (this.config.cwd) {
			return this.config.cwd;
		}
		if (this.config.runtime) {
			return this.config.runtime.os.homedir();
		}
		return process.cwd();
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
			providerOptions: this.config.providerOptions,
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

	private async autoCompact(signal?: AbortSignal): Promise<void> {
		const compactionConfig = this.config.compaction;
		if (!compactionConfig || compactionConfig.mode !== "auto" || !this._sessionManager || this.isCompacting) {
			return;
		}

		try {
			await this.runCompaction(compactionConfig, signal, false);
		} catch {
			// Compaction errors are reported through onCompactionError callback.
		}
	}

	private async runCompaction(
		compactionConfig: CompactionConfig,
		signal: AbortSignal | undefined,
		skipThresholdCheck: boolean,
	): Promise<CompactionResult | undefined> {
		if (!this._sessionManager || this.isCompacting) {
			return undefined;
		}

		const settings = {
			...DEFAULT_COMPACTION_SETTINGS,
			enabled: true,
			...compactionConfig.settings,
		};

		if (!skipThresholdCheck) {
			const contextTokens = estimateContextTokens(this._messages);
			if (!shouldCompact(contextTokens, compactionConfig.contextWindow, settings)) {
				return undefined;
			}
		}

		const preparation = prepareCompaction(this._sessionManager.getBranch(), settings);
		if (!preparation || preparation.messagesToSummarize.length === 0) {
			return undefined;
		}

		this.isCompacting = true;
		compactionConfig.onCompactionStart?.();

		try {
			const result = await compact(
				preparation,
				compactionConfig.model ?? this.config.model,
				this.config.providerOptions,
				signal,
			);

			this._sessionManager.appendCompaction(
				result.summary,
				result.firstKeptEntryId,
				result.tokensBefore,
				result.details,
			);
			this._messages = this._sessionManager.buildSessionContext().messages;

			compactionConfig.onCompactionComplete?.(result);
			return result;
		} catch (error) {
			const compactionError = error instanceof Error ? error : new Error(String(error));
			compactionConfig.onCompactionError?.(compactionError);
			throw compactionError;
		} finally {
			this.isCompacting = false;
		}
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

		await this.autoCompact(signal);

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

		// Auto-persist when stream is fully consumed, and resolve response only after auto-compaction.
		const responsePromise = Promise.resolve(result.response).then(async (response) => {
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

			await this.autoCompact(signal);
			return response;
		});

		// Prevent unhandled rejection warnings when callers ignore result.response.
		void responsePromise.catch(() => {});

		Object.defineProperty(result, "response", {
			configurable: true,
			enumerable: true,
			value: responsePromise,
			writable: false,
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
					{
						role: "user" as const,
						content: [{ type: "text" as const, text: options.prompt }],
					},
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
