/**
 * Interactive mode using @mariozechner/pi-tui.
 *
 * Replaces the old readline-based REPL with a proper TUI that matches
 * the UX patterns from @mariozechner/pi-coding-agent:
 * - Editor component for input with submit/escape handling
 * - Markdown rendering for assistant responses
 * - Tool execution components with collapsible output
 * - Footer with model/provider info and token stats
 * - Container-based layout (header → chat → pending → editor → footer)
 * - Context compaction (manual /compact + auto mode)
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import {
	CombinedAutocompleteProvider,
	Container,
	Editor,
	Key,
	Loader,
	matchesKey,
	ProcessTerminal,
	type SelectItem,
	SelectList,
	type SlashCommand,
	Spacer,
	Text,
	TUI,
} from "@mariozechner/pi-tui";
import type { ImagePart, ModelMessage } from "ai";
import chalk from "chalk";
import type { CodingAgent, CodingAgentConfig } from "edge-pi";
import { type CompactionResult, estimateContextTokens, SessionManager as SessionManagerClass } from "edge-pi";
import type { AuthStorage } from "../../auth/auth-storage.js";
import type { ContextFile } from "../../context.js";
import { getLatestModels } from "../../model-factory.js";
import type { PromptTemplate } from "../../prompts.js";
import { expandPromptTemplate } from "../../prompts.js";
import type { SettingsManager } from "../../settings.js";
import type { Skill } from "../../skills.js";
import { executeBashCommand } from "../../utils/bash-executor.js";
import { type ClipboardImage, extensionForImageMimeType, readClipboardImage } from "../../utils/clipboard-image.js";
import { formatAIError } from "../../utils/format-ai-error.js";
import { formatPendingMessages, parseBashInput } from "./bash-helpers.js";
import { AssistantMessageComponent } from "./components/assistant-message.js";
import { BashExecutionComponent } from "./components/bash-execution.js";
import { CompactionSummaryComponent } from "./components/compaction-summary.js";
import { FooterComponent } from "./components/footer.js";
import { ToolExecutionComponent, type ToolOutput } from "./components/tool-execution.js";
import { UserMessageComponent } from "./components/user-message.js";
import { getEditorTheme, getMarkdownTheme, getSelectListTheme } from "./theme.js";

/** Default context window size (used when model doesn't report one). */
const DEFAULT_CONTEXT_WINDOW = 200_000;
const DEFAULT_COMPACTION_SETTINGS = {
	reserveTokens: 16384,
	keepRecentTokens: 20000,
} as const;

type CompactionSettings = {
	reserveTokens: number;
	keepRecentTokens: number;
};

/** Extract display-friendly output from a tool result. Handles both plain strings and structured objects with text/image fields. */
function extractToolOutput(output: unknown): ToolOutput {
	if (typeof output === "string") {
		return { text: output };
	}
	if (typeof output === "object" && output !== null && "text" in output && typeof (output as any).text === "string") {
		const obj = output as any;
		return {
			text: obj.text,
			...(obj.image && { image: obj.image }),
		};
	}
	return { text: JSON.stringify(output) };
}

export interface InteractiveModeOptions {
	initialMessage?: string;
	initialMessages?: string[];
	skills?: Skill[];
	contextFiles?: ContextFile[];
	prompts?: PromptTemplate[];
	verbose?: boolean;
	provider: string;
	modelId: string;
	authStorage?: AuthStorage;
	/** Settings manager for persisting user preferences (provider, model, compaction). */
	settingsManager?: SettingsManager;
	/** Path to the `fd` binary for @ file autocomplete, or undefined if unavailable. */
	fdPath?: string;
	/** Called when the user switches model via Ctrl+L. Returns a new agent for the new model. */
	onModelChange?: (provider: string, modelId: string) => Promise<CodingAgent>;
	/** Context window size for the model. Defaults to 200k. */
	contextWindow?: number;
	/** Directory where session files are stored. Required for /resume. */
	sessionDir?: string;
	/** Agent config used to recreate agents when resuming sessions. */
	agentConfig?: CodingAgentConfig;
	/** When true, show the session picker immediately on startup. */
	resumeOnStart?: boolean;
}

/**
 * Run the interactive TUI mode with streaming output.
 */
export async function runInteractiveMode(agent: CodingAgent, options: InteractiveModeOptions): Promise<void> {
	const mode = new InteractiveMode(agent, options);
	await mode.run();
}

// ============================================================================
// InteractiveMode class
// ============================================================================

class InteractiveMode {
	private agent: CodingAgent;
	private options: InteractiveModeOptions;
	private currentProvider: string;
	private currentModelId: string;

	private ui!: TUI;
	private headerContainer!: Container;
	private chatContainer!: Container;
	private pendingContainer!: Container;
	private pendingMessagesContainer!: Container;
	private editorContainer!: Container;
	private editor!: Editor;
	private editorTheme!: import("@mariozechner/pi-tui").EditorTheme;

	// Message queues
	private steeringMessages: string[] = [];
	private followUpMessages: string[] = [];
	private isStreaming = false;

	// Inline bash state
	private isBashMode = false;
	private isBashRunning = false;
	private bashAbortController: AbortController | null = null;
	private bashComponent: import("./components/bash-execution.js").BashExecutionComponent | undefined = undefined;
	private footer!: FooterComponent;

	// Loading animation during agent processing
	private loadingAnimation: Loader | undefined = undefined;

	// Streaming state
	private streamingComponent: AssistantMessageComponent | undefined = undefined;
	private streamingText = "";
	private hadToolResults = false;

	// Tool execution tracking: toolCallId → component
	private pendingTools = new Map<string, ToolExecutionComponent>();

	// Tool output expansion state
	private toolOutputExpanded = false;

	// Callback for resolving user input promise
	private onInputCallback?: (text: string) => void;

	// Pending clipboard images to attach to the next message
	private pendingImages: ClipboardImage[] = [];

	// Compaction state
	private contextWindow: number;
	private compactionSettings: CompactionSettings;
	private autoCompaction = true;
	private isCompacting = false;
	private compactionLoader: Loader | null = null;

	constructor(agent: CodingAgent, options: InteractiveModeOptions) {
		this.agent = agent;
		this.options = options;
		this.currentProvider = options.provider;
		this.currentModelId = options.modelId;
		this.contextWindow = options.contextWindow ?? DEFAULT_CONTEXT_WINDOW;

		// Initialize compaction settings from persisted settings if available
		const savedCompaction = options.settingsManager?.getCompaction();
		this.compactionSettings = {
			...DEFAULT_COMPACTION_SETTINGS,
			...(savedCompaction?.reserveTokens !== undefined && { reserveTokens: savedCompaction.reserveTokens }),
			...(savedCompaction?.keepRecentTokens !== undefined && { keepRecentTokens: savedCompaction.keepRecentTokens }),
		};
		this.autoCompaction = options.settingsManager?.getCompactionEnabled() ?? true;

		this.configureAgentCompaction();
	}

	async run(): Promise<void> {
		this.initUI();
		this.updateFooterTokens();

		// Show session picker immediately if --resume was passed
		if (this.options.resumeOnStart) {
			await this.handleResume();
		}

		// Process initial messages
		const { initialMessage, initialMessages = [] } = this.options;

		const allInitial: string[] = [];
		if (initialMessage) allInitial.push(initialMessage);
		allInitial.push(...initialMessages);

		for (const msg of allInitial) {
			this.chatContainer.addChild(new UserMessageComponent(msg, getMarkdownTheme()));
			this.ui.requestRender();
			await this.streamPrompt(msg);
		}

		// Main interactive loop
		while (true) {
			const userInput = await this.getUserInput();
			await this.handleUserInput(userInput);
		}
	}

	// ========================================================================
	// UI Setup
	// ========================================================================

	private initUI(): void {
		const { provider, modelId, skills = [], contextFiles = [], prompts = [], verbose } = this.options;

		this.ui = new TUI(new ProcessTerminal());

		// Header
		this.headerContainer = new Container();
		const logo = chalk.bold("epi") + chalk.dim(` - ${provider}/${modelId}`);

		const hints = [
			`${chalk.dim("Escape")} to abort`,
			`${chalk.dim("!")} inline bash`,
			`${chalk.dim("Alt+Enter")} follow-up while streaming`,
			`${chalk.dim("Ctrl+C")} to exit`,
			`${chalk.dim("Ctrl+E")} to expand tools`,
			`${chalk.dim("Ctrl+L")} to switch model`,
			`${chalk.dim("Ctrl+V")} to paste image`,
			`${chalk.dim("↑/↓")} to browse history`,
			`${chalk.dim("@")} for file references`,
			`${chalk.dim("/")} for commands`,
		].join("\n");

		this.headerContainer.addChild(new Spacer(1));
		this.headerContainer.addChild(new Text(`${logo}\n${hints}`, 1, 0));
		this.headerContainer.addChild(new Spacer(1));

		if (verbose && this.agent.sessionManager?.getSessionFile()) {
			this.headerContainer.addChild(
				new Text(chalk.dim(`Session: ${this.agent.sessionManager.getSessionFile()}`), 1, 0),
			);
		}

		// Show loaded context, skills, and prompts at startup
		this.showLoadedResources(contextFiles, skills, prompts);

		// Chat area
		this.chatContainer = new Container();

		// Pending messages (loading animations, status)
		this.pendingContainer = new Container();

		// Pending steering/follow-up messages
		this.pendingMessagesContainer = new Container();

		// Editor with slash command autocomplete
		this.editorTheme = getEditorTheme();
		this.editor = new Editor(this.ui, this.editorTheme);
		this.editor.setAutocompleteProvider(this.buildAutocompleteProvider());
		this.editorContainer = new Container();
		this.editorContainer.addChild(this.editor);

		// Footer
		this.footer = new FooterComponent(this.currentProvider, this.currentModelId);
		this.footer.setAutoCompaction(this.autoCompaction);
		this.footer.setSubscription(this.isSubscriptionProvider());

		// Assemble layout
		this.ui.addChild(this.headerContainer);
		this.ui.addChild(this.chatContainer);
		this.ui.addChild(this.pendingMessagesContainer);
		this.ui.addChild(this.pendingContainer);
		this.ui.addChild(this.editorContainer);
		this.ui.addChild(this.footer);

		this.ui.setFocus(this.editor);
		this.setupKeyHandlers();

		this.ui.start();
	}

	// ========================================================================
	// Key Handlers
	// ========================================================================

	private setupKeyHandlers(): void {
		this.editor.onChange = (text: string) => {
			const wasBashMode = this.isBashMode;
			this.isBashMode = text.trimStart().startsWith("!");
			if (wasBashMode !== this.isBashMode) {
				this.updateEditorBorderColor();
			}
		};
		this.editor.onSubmit = (text: string) => {
			text = text.trim();
			if (!text) return;

			// If agent is streaming, Enter becomes a steering message
			if (this.isStreaming) {
				this.agent.steer({ role: "user", content: [{ type: "text", text }] });
				this.steeringMessages.push(text);
				this.editor.setText("");
				this.updatePendingMessagesDisplay();
				return;
			}

			this.editor.addToHistory(text);
			this.editor.setText("");

			if (this.onInputCallback) {
				this.onInputCallback(text);
			}
		};

		const origHandleInput = this.editor.handleInput.bind(this.editor);
		this.editor.handleInput = (data: string) => {
			// Escape: abort if agent is running or compacting
			if (matchesKey(data, Key.escape)) {
				if (this.isBashRunning && this.bashAbortController) {
					this.bashAbortController.abort();
					return;
				}
				if (this.isCompacting) {
					this.agent.abort();
					return;
				}
				if (this.loadingAnimation) {
					this.agent.abort();
					this.stopLoading();
					return;
				}
			}

			// Ctrl+C: exit
			if (matchesKey(data, Key.ctrl("c"))) {
				this.shutdown();
				return;
			}

			// Ctrl+D: exit if editor is empty
			if (matchesKey(data, Key.ctrl("d"))) {
				if (this.editor.getText().length === 0) {
					this.shutdown();
					return;
				}
			}

			// Ctrl+E: toggle tool output expansion
			if (matchesKey(data, Key.ctrl("e"))) {
				this.toggleToolExpansion();
				return;
			}

			// Ctrl+L: select model
			if (matchesKey(data, Key.ctrl("l"))) {
				this.handleModelSelect();
				return;
			}

			// Ctrl+V: paste image from clipboard
			if (matchesKey(data, Key.ctrl("v"))) {
				this.handleClipboardImagePaste();
				return;
			}

			// Alt+Enter (Option+Enter on Mac): follow-up while streaming (or submit normally when idle)
			if (matchesKey(data, Key.alt("enter"))) {
				const text = this.editor.getText().trim();
				if (!text) return;

				if (this.isStreaming) {
					this.followUpMessages.push(text);
					this.editor.setText("");
					this.updatePendingMessagesDisplay();
					return;
				}

				// Not streaming: treat like regular submit
				this.editor.onSubmit?.(text);
				return;
			}

			// Alt+Up (Option+Up on Mac): dequeue all queued messages back into the editor
			if (matchesKey(data, Key.alt("up"))) {
				const restored = this.clearAllQueues();
				if (restored.length > 0) {
					this.editor.setText(restored.join("\n\n"));
					this.updatePendingMessagesDisplay();
				}
				return;
			}

			origHandleInput(data);
		};
	}

	// ========================================================================
	// User Input
	// ========================================================================

	private getUserInput(): Promise<string> {
		return new Promise((resolve) => {
			this.onInputCallback = (text: string) => {
				this.onInputCallback = undefined;
				resolve(text);
			};
		});
	}

	private async handleUserInput(input: string): Promise<void> {
		// Handle commands
		if (input === "/help") {
			this.showHelp();
			return;
		}

		if (input === "/skills") {
			this.showSkills();
			return;
		}

		if (input === "/quit" || input === "/exit") {
			this.shutdown();
			return;
		}

		if (input === "/model") {
			await this.handleModelSelect();
			return;
		}

		if (input === "/login") {
			await this.handleLogin();
			return;
		}

		if (input === "/logout") {
			await this.handleLogout();
			return;
		}

		if (input === "/compact" || input.startsWith("/compact ")) {
			const customInstructions = input.startsWith("/compact ") ? input.slice(9).trim() : undefined;
			await this.handleCompactCommand(customInstructions);
			return;
		}

		if (input === "/auto-compact") {
			this.toggleAutoCompaction();
			return;
		}

		if (input === "/resume") {
			await this.handleResume();
			return;
		}

		if (input.startsWith("/skill:")) {
			const skillName = input.slice("/skill:".length).trim();
			await this.handleSkillInvocation(skillName);
			return;
		}

		// Handle bash commands (! for normal, !! for excluded from context)
		const bashParsed = parseBashInput(input);
		if (bashParsed) {
			if (this.isBashRunning) {
				this.showStatus(chalk.yellow("A bash command is already running. Press Escape to cancel it first."));
				return;
			}
			await this.handleBashCommand(bashParsed.command, bashParsed.excludeFromContext);
			this.isBashMode = false;
			this.updateEditorBorderColor();
			return;
		}

		// Try expanding prompt templates
		const { prompts = [] } = this.options;
		const expanded = expandPromptTemplate(input, prompts);

		// Capture and clear pending images
		const images = this.pendingImages.length > 0 ? [...this.pendingImages] : undefined;
		this.pendingImages = [];

		// Regular message (use expanded text if a prompt template was matched)
		const imageLabel = images ? chalk.dim(` (${images.length} image${images.length > 1 ? "s" : ""})`) : "";
		this.chatContainer.addChild(new UserMessageComponent(`${expanded}${imageLabel}`, getMarkdownTheme()));
		this.ui.requestRender();
		await this.streamPrompt(expanded, images);
	}

	private async handleBashCommand(command: string, excludeFromContext: boolean): Promise<void> {
		this.bashAbortController = new AbortController();
		this.isBashRunning = true;

		this.bashComponent = new BashExecutionComponent(command, this.ui, excludeFromContext);
		if (this.toolOutputExpanded) {
			this.bashComponent.setExpanded(true);
		}
		this.chatContainer.addChild(this.bashComponent);
		this.ui.requestRender();

		try {
			const result = await executeBashCommand(command, {
				signal: this.bashAbortController.signal,
				onChunk: (chunk) => {
					this.bashComponent?.appendOutput(chunk);
					this.ui.requestRender();
				},
			});

			this.bashComponent.setComplete(result.exitCode, result.cancelled, result.truncated, result.fullOutputPath);
			this.ui.requestRender();

			if (!excludeFromContext) {
				const msgText = `Ran \`${command}\`\n\n\`\`\`\n${result.output.trimEnd()}\n\`\`\``;
				const userMsg: ModelMessage = { role: "user", content: [{ type: "text", text: msgText }] };
				this.agent.setMessages([...this.agent.messages, userMsg]);
				this.agent.sessionManager?.appendMessage(userMsg);
			}
		} finally {
			this.isBashRunning = false;
			this.bashAbortController = null;
			this.bashComponent = undefined;
		}
	}

	// ========================================================================
	// Autocomplete
	// ========================================================================

	private buildAutocompleteProvider(): CombinedAutocompleteProvider {
		const { skills = [], prompts = [], fdPath } = this.options;

		const commands: SlashCommand[] = [
			{ name: "help", description: "Show available commands" },
			{ name: "resume", description: "Resume a previous session" },
			{ name: "compact", description: "Manually compact the session context" },
			{ name: "auto-compact", description: "Toggle automatic context compaction" },
			{ name: "login", description: "Login to an OAuth provider" },
			{ name: "logout", description: "Logout from an OAuth provider" },
			{ name: "skills", description: "List loaded skills" },
			{ name: "model", description: "Switch model (Ctrl+L)" },
			{ name: "quit", description: "Exit the CLI" },
			{ name: "exit", description: "Exit the CLI" },
		];

		for (const skill of skills) {
			commands.push({
				name: `skill:${skill.name}`,
				description: skill.description,
			});
		}

		// Add prompt templates as slash commands
		for (const prompt of prompts) {
			commands.push({
				name: prompt.name,
				description: prompt.description,
			});
		}

		return new CombinedAutocompleteProvider(commands, process.cwd(), fdPath ?? null);
	}

	// ========================================================================
	// Model Selection
	// ========================================================================

	private async handleModelSelect(): Promise<void> {
		const latestModels = getLatestModels();
		const modelOptions: { provider: string; modelId: string; label: string }[] = [];
		for (const [provider, models] of Object.entries(latestModels)) {
			for (const modelId of models) {
				modelOptions.push({ provider, modelId, label: `${provider}/${modelId}` });
			}
		}

		const items: SelectItem[] = modelOptions.map((m) => {
			const current = m.provider === this.currentProvider && m.modelId === this.currentModelId;
			return {
				value: `${m.provider}/${m.modelId}`,
				label: current ? `${m.label} (current)` : m.label,
			};
		});

		const selected = await this.showSelectList("Switch model", items);
		if (!selected) return;

		const [newProvider, ...modelParts] = selected.split("/");
		const newModelId = modelParts.join("/");

		if (newProvider === this.currentProvider && newModelId === this.currentModelId) {
			return;
		}

		this.showStatus(chalk.dim(`Switching to ${newProvider}/${newModelId}...`));

		if (!this.options.onModelChange) {
			this.showStatus(chalk.yellow("Model switching is not available."));
			return;
		}

		try {
			const newAgent = await this.options.onModelChange(newProvider, newModelId);
			// Preserve conversation history
			newAgent.setMessages([...this.agent.messages]);
			this.agent = newAgent;
			this.configureAgentCompaction();

			this.currentProvider = newProvider;
			this.currentModelId = newModelId;
			this.updateFooter();

			// Persist the choice for next startup
			this.options.settingsManager?.setDefaults(newProvider, newModelId);

			this.showStatus(chalk.green(`Switched to ${newProvider}/${newModelId}`));
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			this.showStatus(chalk.red(`Failed to switch model: ${msg}`));
		}
	}

	// ========================================================================
	// Streaming
	// ========================================================================

	private async streamPrompt(prompt: string, images?: ClipboardImage[]): Promise<void> {
		this.isStreaming = true;
		this.updatePendingMessagesDisplay();

		// Build image parts from clipboard images
		const imageParts: ImagePart[] = (images ?? []).map((img) => ({
			type: "image" as const,
			image: Buffer.from(img.bytes).toString("base64"),
			mediaType: img.mimeType,
		}));

		// Start loading animation
		this.startLoading();

		this.streamingComponent = undefined;
		this.streamingText = "";
		this.hadToolResults = false;

		let errorDisplayed = false;
		let streamFailed = false;
		try {
			const result =
				imageParts.length > 0
					? await this.agent.stream({
							messages: [
								{
									role: "user" as const,
									content: [{ type: "text" as const, text: prompt }, ...imageParts],
								},
							],
						})
					: await this.agent.stream({ prompt });

			for await (const part of result.fullStream) {
				switch (part.type) {
					case "text-delta":
						// After tool results, or for the very first text part, start a new assistant message component
						// so each agent step gets its own message bubble
						if (this.hadToolResults || !this.streamingComponent) {
							this.streamingComponent = new AssistantMessageComponent(getMarkdownTheme());
							this.streamingText = "";
							this.hadToolResults = false;
							this.chatContainer.addChild(this.streamingComponent);
						}
						this.streamingText += part.text;
						this.streamingComponent!.updateText(this.streamingText);
						this.ui.requestRender();
						break;

					case "tool-call": {
						const args =
							typeof part.input === "object" && part.input !== null
								? (part.input as Record<string, unknown>)
								: {};
						const toolComponent = new ToolExecutionComponent(part.toolName, args);

						if (this.toolOutputExpanded) {
							toolComponent.setExpanded(true);
						}

						this.pendingTools.set(part.toolCallId, toolComponent);
						this.chatContainer.addChild(toolComponent);
						this.ui.requestRender();
						break;
					}

					case "tool-result": {
						const toolComponent = this.pendingTools.get(part.toolCallId);
						if (toolComponent) {
							const toolOutput = extractToolOutput(part.output);
							toolComponent.updateResult(toolOutput, /* isError */ false, /* isPartial */ false);
							this.pendingTools.delete(part.toolCallId);
							this.hadToolResults = true;
							this.ui.requestRender();
						}
						break;
					}

					case "error": {
						const errorMessage = formatAIError(part.error);
						if (this.streamingComponent) {
							this.streamingComponent.setError(errorMessage);
						} else {
							this.showStatus(chalk.red(`Error: ${errorMessage}`));
						}
						errorDisplayed = true;
						break;
					}
				}
			}

			if (errorDisplayed) return;

			// Wait for stream to complete — the agent auto-updates messages and persists to session
			await result.response;

			// Update footer token stats
			this.updateFooterTokens();
		} catch (error) {
			if (errorDisplayed) {
				streamFailed = true;
				return;
			}

			streamFailed = true;
			if ((error as Error).name === "AbortError") {
				if (this.streamingComponent) {
					this.streamingComponent.setAborted();
				} else {
					this.showStatus(chalk.dim("[aborted]"));
				}
			} else {
				const msg =
					error instanceof Error
						? error.message
						: typeof error === "object" && error !== null
							? JSON.stringify(error)
							: String(error);
				if (this.streamingComponent) {
					this.streamingComponent.setError(msg);
				} else {
					this.showStatus(chalk.red(`Error: ${msg}`));
				}
			}
		} finally {
			this.stopLoading();
			this.streamingComponent = undefined;
			this.streamingText = "";
			this.hadToolResults = false;
			this.pendingTools.clear();
			this.isStreaming = false;
			this.steeringMessages = [];
			if (streamFailed) {
				this.followUpMessages = [];
			}
			this.updatePendingMessagesDisplay();
			this.ui.requestRender();
		}

		// Process queued follow-ups (skipped if stream failed/aborted)
		while (this.followUpMessages.length > 0) {
			const next = this.followUpMessages.shift();
			if (!next) break;

			this.updatePendingMessagesDisplay();

			this.chatContainer.addChild(new UserMessageComponent(next, getMarkdownTheme()));
			this.ui.requestRender();
			await this.streamPrompt(next);
		}
	}

	private updatePendingMessagesDisplay(): void {
		this.pendingMessagesContainer.clear();

		// If no agent is running, clear pending messages (they've been consumed)
		if (!this.isStreaming && this.followUpMessages.length === 0 && this.steeringMessages.length === 0) {
			this.ui.requestRender();
			return;
		}

		const lines = formatPendingMessages(this.steeringMessages, this.followUpMessages);

		if (lines.length === 0) {
			this.ui.requestRender();
			return;
		}

		this.pendingMessagesContainer.addChild(new Spacer(1));
		this.pendingMessagesContainer.addChild(new Text(lines.map((l) => chalk.dim(l)).join("\n"), 1, 0));
		this.pendingMessagesContainer.addChild(new Text(chalk.dim("↳ Alt+Up to edit queued messages"), 1, 0));
		this.pendingMessagesContainer.addChild(new Spacer(1));
		this.ui.requestRender();
	}

	private clearAllQueues(): string[] {
		const restored = [...this.steeringMessages, ...this.followUpMessages];
		this.steeringMessages = [];
		this.followUpMessages = [];
		return restored;
	}

	// ========================================================================
	// Loading Animation
	// ========================================================================

	private startLoading(): void {
		this.stopLoading();
		this.loadingAnimation = new Loader(
			this.ui,
			(s: string) => chalk.cyan(s),
			(s: string) => chalk.dim(s),
			"Working...",
		);
		this.loadingAnimation.start();
		this.pendingContainer.addChild(new Spacer(1));
		this.pendingContainer.addChild(this.loadingAnimation);
		this.ui.requestRender();
	}

	private stopLoading(): void {
		if (this.loadingAnimation) {
			this.loadingAnimation.stop();
			this.pendingContainer.clear();
			this.loadingAnimation = undefined;
			this.ui.requestRender();
		}
	}

	// ========================================================================
	// Tool Expansion
	// ========================================================================

	private toggleToolExpansion(): void {
		this.toolOutputExpanded = !this.toolOutputExpanded;

		// Update all tool components and compaction components in the chat
		for (const child of this.chatContainer.children) {
			if (child instanceof ToolExecutionComponent) {
				child.setExpanded(this.toolOutputExpanded);
			} else if (child instanceof CompactionSummaryComponent) {
				child.setExpanded(this.toolOutputExpanded);
			} else if (child instanceof BashExecutionComponent) {
				child.setExpanded(this.toolOutputExpanded);
			}
		}

		this.ui.requestRender();
	}

	// ========================================================================
	// Clipboard Image Paste
	// ========================================================================

	private handleClipboardImagePaste(): void {
		try {
			const image = readClipboardImage();
			if (!image) return;
			this.pendingImages.push(image);
			const ext = extensionForImageMimeType(image.mimeType) ?? "image";
			const label = `[image ${this.pendingImages.length}: ${ext}]`;
			this.editor.insertTextAtCursor(label);
			this.ui.requestRender();
		} catch {
			// Silently ignore clipboard errors (may not have permission, etc.)
		}
	}

	// ========================================================================
	// Compaction
	// ========================================================================

	/**
	 * Handle the /compact command.
	 */
	private async handleCompactCommand(_customInstructions?: string): Promise<void> {
		try {
			const result = await this.agent.compact();
			if (!result) {
				this.showStatus(chalk.yellow("Nothing to compact (already compacted or insufficient history)."));
			}
		} catch (error) {
			// Compaction callbacks already report errors in interactive mode.
			// Catch here to avoid unwinding the main TUI loop on abort/provider errors.
			if (!this.agent.compaction?.onCompactionError) {
				const compactionError = error instanceof Error ? error : new Error(String(error));
				if (compactionError.name === "AbortError" || compactionError.message === "Compaction cancelled") {
					this.showStatus(chalk.dim("Compaction cancelled."));
				} else {
					this.showStatus(chalk.red(`Compaction failed: ${compactionError.message}`));
				}
				this.ui.requestRender();
			}
		}
	}

	/**
	 * Toggle auto-compaction on/off.
	 */
	private toggleAutoCompaction(): void {
		this.autoCompaction = !this.autoCompaction;
		this.footer.setAutoCompaction(this.autoCompaction);
		this.options.settingsManager?.setCompactionEnabled(this.autoCompaction);
		if (this.agent.compaction) {
			this.agent.setCompaction({
				...this.agent.compaction,
				mode: this.autoCompaction ? "auto" : "manual",
			});
		}
		this.showStatus(
			this.autoCompaction ? chalk.green("Auto-compaction enabled") : chalk.dim("Auto-compaction disabled"),
		);
		this.ui.requestRender();
	}

	/**
	 * Configure agent-level compaction and callbacks for UI updates.
	 */
	private configureAgentCompaction(): void {
		const mode = this.autoCompaction ? "auto" : "manual";
		this.agent.setCompaction({
			contextWindow: this.contextWindow,
			mode,
			settings: {
				reserveTokens: this.compactionSettings.reserveTokens,
				keepRecentTokens: this.compactionSettings.keepRecentTokens,
			},
			onCompactionStart: () => {
				this.isCompacting = true;
				this.compactionLoader?.stop();
				this.compactionLoader = new Loader(
					this.ui,
					(s: string) => chalk.cyan(s),
					(s: string) => chalk.dim(s),
					this.autoCompaction
						? "Auto-compacting context... (Escape to cancel)"
						: "Compacting context... (Escape to cancel)",
				);
				this.compactionLoader.start();
				this.pendingContainer.clear();
				this.pendingContainer.addChild(new Spacer(1));
				this.pendingContainer.addChild(this.compactionLoader);
				this.ui.requestRender();
			},
			onCompactionComplete: (result: CompactionResult) => {
				this.compactionLoader?.stop();
				this.compactionLoader = null;
				this.pendingContainer.clear();
				this.isCompacting = false;

				this.rebuildChatFromSession();
				const summaryComponent = new CompactionSummaryComponent(result.tokensBefore, result.summary);
				if (this.toolOutputExpanded) {
					summaryComponent.setExpanded(true);
				}
				this.chatContainer.addChild(summaryComponent);

				this.updateFooterTokens();
				if (this.options.verbose) {
					const tokensAfter = estimateContextTokens([...this.agent.messages]);
					this.showStatus(
						chalk.dim(
							`Compacted: ${result.tokensBefore.toLocaleString()} -> ${tokensAfter.toLocaleString()} tokens`,
						),
					);
				}
				this.ui.requestRender();
			},
			onCompactionError: (error: Error) => {
				this.compactionLoader?.stop();
				this.compactionLoader = null;
				this.pendingContainer.clear();
				this.isCompacting = false;

				if (error.name === "AbortError" || error.message === "Compaction cancelled") {
					this.showStatus(chalk.dim("Compaction cancelled."));
				} else {
					this.showStatus(chalk.red(`Compaction failed: ${error.message}`));
				}
				this.ui.requestRender();
			},
		});
	}

	/**
	 * Rebuild the chat UI from session context after compaction.
	 */
	private rebuildChatFromSession(): void {
		this.chatContainer.clear();

		const messages = this.agent.messages;
		for (const msg of messages) {
			if (msg.role === "user") {
				// Check if this is a compaction summary
				const content = msg.content;
				if (Array.isArray(content) && content.length > 0) {
					const textBlock = content[0] as { type: string; text?: string };
					if (textBlock.type === "text" && textBlock.text?.startsWith('<summary type="compaction"')) {
						// Skip compaction summaries in rebuild (they are injected by buildSessionContext)
						continue;
					}
					if (textBlock.type === "text" && textBlock.text?.startsWith('<summary type="branch"')) {
						continue;
					}
				}
				const text = extractTextFromMessage(msg);
				if (text) {
					this.chatContainer.addChild(new UserMessageComponent(text, getMarkdownTheme()));
				}
			} else if (msg.role === "assistant") {
				const assistantMsg = msg as import("edge-pi").AssistantModelMessage;
				const textParts: string[] = [];
				for (const block of assistantMsg.content) {
					const b = block as {
						type: string;
						text?: string;
						toolName?: string;
						input?: unknown;
						toolCallId?: string;
					};
					if (b.type === "text" && b.text) {
						textParts.push(b.text);
					} else if (b.type === "tool-call" && b.toolName) {
						const args =
							typeof b.input === "object" && b.input !== null ? (b.input as Record<string, unknown>) : {};
						const toolComp = new ToolExecutionComponent(b.toolName, args);
						if (this.toolOutputExpanded) {
							toolComp.setExpanded(true);
						}
						// Mark as completed (we don't have the result here, just show collapsed)
						toolComp.updateResult({ text: "(from history)" }, false, false);
						this.chatContainer.addChild(toolComp);
					}
				}
				if (textParts.length > 0) {
					const comp = new AssistantMessageComponent(getMarkdownTheme());
					comp.updateText(textParts.join(""));
					this.chatContainer.addChild(comp);
				}
			}
			// Skip tool messages in UI rebuild - they are consumed by tool-call components
		}

		this.ui.requestRender();
	}

	// ========================================================================
	// Footer Token Tracking
	// ========================================================================

	/**
	 * Update the footer with current token count information.
	 */
	private updateFooterTokens(): void {
		const contextTokens = estimateContextTokens([...this.agent.messages]);
		this.footer.setTokenInfo(contextTokens, this.contextWindow);
		this.footer.setAutoCompaction(this.autoCompaction);
		this.ui?.requestRender();
	}

	/**
	 * Check if the current provider is using an OAuth subscription credential.
	 */
	private isSubscriptionProvider(): boolean {
		const { authStorage } = this.options;
		if (!authStorage) return false;
		const cred = authStorage.get(this.currentProvider);
		return cred?.type === "oauth";
	}

	/**
	 * Replace the footer component and update token info.
	 */
	private updateFooter(): void {
		this.footer = new FooterComponent(this.currentProvider, this.currentModelId);
		this.footer.setSubscription(this.isSubscriptionProvider());
		this.updateFooterTokens();

		// Replace footer in UI
		const children = this.ui.children;
		children[children.length - 1] = this.footer;
		this.ui.requestRender();
	}

	// ========================================================================
	// Startup Resource Display
	// ========================================================================

	private formatDisplayPath(p: string): string {
		const home = process.env.HOME || process.env.USERPROFILE || "";
		if (home && p.startsWith(home)) {
			return `~${p.slice(home.length)}`;
		}
		return p;
	}

	private showLoadedResources(contextFiles: ContextFile[], skills: Skill[], prompts: PromptTemplate[]): void {
		const sectionHeader = (name: string) => chalk.cyan(`[${name}]`);

		if (contextFiles.length > 0) {
			const contextList = contextFiles.map((f) => chalk.dim(`  ${this.formatDisplayPath(f.path)}`)).join("\n");
			this.headerContainer.addChild(new Text(`${sectionHeader("Context")}\n${contextList}`, 0, 0));
			this.headerContainer.addChild(new Spacer(1));
		}

		if (skills.length > 0) {
			const skillList = skills.map((s) => chalk.dim(`  ${this.formatDisplayPath(s.filePath)}`)).join("\n");
			this.headerContainer.addChild(new Text(`${sectionHeader("Skills")}\n${skillList}`, 0, 0));
			this.headerContainer.addChild(new Spacer(1));
		}

		if (prompts.length > 0) {
			const promptList = prompts
				.map((p) => {
					const sourceLabel = chalk.cyan(p.source);
					return chalk.dim(`  ${sourceLabel}  /${p.name}`);
				})
				.join("\n");
			this.headerContainer.addChild(new Text(`${sectionHeader("Prompts")}\n${promptList}`, 0, 0));
			this.headerContainer.addChild(new Spacer(1));
		}
	}

	// ========================================================================
	// Commands
	// ========================================================================

	private showHelp(): void {
		const helpText = [
			chalk.bold("Commands:"),
			"  !<command>          Run inline bash and include output in context",
			"  !!<command>         Run inline bash but exclude output from context",
			"  /resume             Resume a previous session",
			"  /compact [text]     Compact the session context (optional instructions)",
			"  /auto-compact       Toggle automatic context compaction",
			"  /model              Switch model (Ctrl+L)",
			"  /login              Login to an OAuth provider",
			"  /logout             Logout from an OAuth provider",
			"  /skills             List loaded skills",
			"  /skill:<name>       Invoke a skill by name",
			"  /quit, /exit        Exit the CLI",
		].join("\n");

		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(new Text(helpText, 1, 0));
		this.ui.requestRender();
	}

	private showSkills(): void {
		const { skills = [] } = this.options;

		if (skills.length === 0) {
			this.showStatus(chalk.dim("No skills loaded."));
			return;
		}

		const lines: string[] = [];
		for (const skill of skills) {
			const hidden = skill.disableModelInvocation ? chalk.dim(" (hidden from model)") : "";
			lines.push(`  ${chalk.bold(skill.name)}${hidden}`);
			lines.push(chalk.dim(`    ${skill.description}`));
			lines.push(chalk.dim(`    ${skill.filePath}`));
		}

		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(new Text(lines.join("\n"), 1, 0));
		this.ui.requestRender();
	}

	private async handleSkillInvocation(skillName: string): Promise<void> {
		const { skills = [] } = this.options;
		const skill = skills.find((s) => s.name === skillName);

		if (!skill) {
			this.showStatus(chalk.red(`Skill "${skillName}" not found.`));
			return;
		}

		const skillPrompt = `Please read and follow the instructions in the skill file: ${skill.filePath}`;
		this.chatContainer.addChild(new UserMessageComponent(skillPrompt, getMarkdownTheme()));
		this.ui.requestRender();
		await this.streamPrompt(skillPrompt);
	}

	// ========================================================================
	// OAuth Login/Logout
	// ========================================================================

	private async handleLogin(): Promise<void> {
		const { authStorage } = this.options;
		if (!authStorage) {
			this.showStatus(chalk.red("Auth storage not available."));
			return;
		}

		const providers = authStorage.getProviders();
		if (providers.length === 0) {
			this.showStatus(chalk.dim("No OAuth providers registered."));
			return;
		}

		// Use SelectList overlay for provider selection
		const items: SelectItem[] = providers.map((p) => {
			const loggedIn = authStorage.get(p.id)?.type === "oauth" ? " (logged in)" : "";
			return { value: p.id, label: `${p.name}${loggedIn}` };
		});

		const selected = await this.showSelectList("Login to OAuth provider", items);
		if (!selected) return;

		const provider = providers.find((p) => p.id === selected);
		if (!provider) return;

		this.showStatus(chalk.dim(`Logging in to ${provider.name}...`));

		try {
			await authStorage.login(provider.id, {
				onAuth: (info) => {
					const lines = [chalk.bold("Open this URL in your browser:"), chalk.cyan(info.url)];
					if (info.instructions) {
						lines.push(chalk.dim(info.instructions));
					}
					this.chatContainer.addChild(new Spacer(1));
					this.chatContainer.addChild(new Text(lines.join("\n"), 1, 0));
					this.ui.requestRender();

					// Try to open browser
					try {
						const { execSync } = require("node:child_process") as typeof import("node:child_process");
						const platform = process.platform;
						if (platform === "darwin") {
							execSync(`open "${info.url}"`, { stdio: "ignore" });
						} else if (platform === "linux") {
							execSync(`xdg-open "${info.url}" 2>/dev/null || sensible-browser "${info.url}" 2>/dev/null`, {
								stdio: "ignore",
							});
						} else if (platform === "win32") {
							execSync(`start "" "${info.url}"`, { stdio: "ignore" });
						}
					} catch {
						// Silently fail - user can open manually
					}
				},
				onPrompt: async (promptInfo) => {
					// Show prompt message and wait for user input
					this.showStatus(chalk.dim(promptInfo.message));
					const answer = await this.getUserInput();
					return answer.trim();
				},
				onProgress: (message) => {
					this.showStatus(chalk.dim(message));
				},
			});

			this.footer.setSubscription(this.isSubscriptionProvider());
			this.ui.requestRender();
			this.showStatus(chalk.green(`Logged in to ${provider.name}. Credentials saved.`));
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			if (msg !== "Login cancelled") {
				this.showStatus(chalk.red(`Login failed: ${msg}`));
			} else {
				this.showStatus(chalk.dim("Login cancelled."));
			}
		}
	}

	private async handleLogout(): Promise<void> {
		const { authStorage } = this.options;
		if (!authStorage) {
			this.showStatus(chalk.red("Auth storage not available."));
			return;
		}

		const loggedIn = authStorage
			.list()
			.filter((id) => authStorage.get(id)?.type === "oauth")
			.map((id) => {
				const provider = authStorage.getProvider(id);
				return { id, name: provider?.name ?? id };
			});

		if (loggedIn.length === 0) {
			this.showStatus(chalk.dim("No OAuth providers logged in. Use /login first."));
			return;
		}

		const items: SelectItem[] = loggedIn.map((p) => ({
			value: p.id,
			label: p.name,
		}));

		const selected = await this.showSelectList("Logout from OAuth provider", items);
		if (!selected) return;

		const entry = loggedIn.find((p) => p.id === selected);
		if (!entry) return;

		authStorage.logout(entry.id);
		this.showStatus(chalk.green(`Logged out of ${entry.name}.`));
	}

	// ========================================================================
	// Resume Session
	// ========================================================================

	/**
	 * List session files from the session directory, sorted by modification time (newest first).
	 * Returns metadata for each session including the first user message as a preview.
	 */
	private listAvailableSessions(): { path: string; mtime: number; preview: string; timestamp: string }[] {
		const { sessionDir } = this.options;
		if (!sessionDir || !existsSync(sessionDir)) return [];

		try {
			const files = readdirSync(sessionDir)
				.filter((f: string) => f.endsWith(".jsonl"))
				.map((f: string) => {
					const filePath = join(sessionDir, f);
					const mtime = statSync(filePath).mtime.getTime();
					return { name: f, path: filePath, mtime };
				})
				.sort((a, b) => b.mtime - a.mtime);

			const sessions: { path: string; mtime: number; preview: string; timestamp: string }[] = [];
			for (const file of files) {
				// Skip the current session file
				if (this.agent.sessionManager?.getSessionFile() === file.path) continue;

				const preview = this.getSessionPreview(file.path);
				const timestamp = new Date(file.mtime).toLocaleString();
				sessions.push({ path: file.path, mtime: file.mtime, preview, timestamp });
			}
			return sessions;
		} catch {
			return [];
		}
	}

	/**
	 * Extract the first user message from a session file for preview.
	 */
	private getSessionPreview(filePath: string): string {
		try {
			const content = readFileSync(filePath, "utf-8");
			const lines = content.trim().split("\n");
			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					const entry = JSON.parse(line);
					if (entry.type === "message" && entry.message?.role === "user") {
						const msg = entry.message;
						let text = "";
						if (typeof msg.content === "string") {
							text = msg.content;
						} else if (Array.isArray(msg.content)) {
							for (const block of msg.content) {
								if (block.type === "text" && block.text) {
									text = block.text;
									break;
								}
							}
						}
						// Truncate and clean up for display
						text = text.replace(/\n/g, " ").trim();
						if (text.length > 80) {
							text = `${text.slice(0, 77)}...`;
						}
						return text || "(empty message)";
					}
				} catch {
					// Skip malformed lines
				}
			}
			return "(no messages)";
		} catch {
			return "(unreadable)";
		}
	}

	/**
	 * Format a relative time string (e.g. "2 hours ago", "3 days ago").
	 */
	private formatRelativeTime(mtime: number): string {
		const now = Date.now();
		const diffMs = now - mtime;
		const diffSec = Math.floor(diffMs / 1000);
		const diffMin = Math.floor(diffSec / 60);
		const diffHour = Math.floor(diffMin / 60);
		const diffDay = Math.floor(diffHour / 24);

		if (diffMin < 1) return "just now";
		if (diffMin < 60) return `${diffMin}m ago`;
		if (diffHour < 24) return `${diffHour}h ago`;
		if (diffDay < 30) return `${diffDay}d ago`;
		return new Date(mtime).toLocaleDateString();
	}

	/**
	 * Handle the /resume command: show a list of previous sessions and load the selected one.
	 */
	private async handleResume(): Promise<void> {
		const sessions = this.listAvailableSessions();
		if (sessions.length === 0) {
			this.showStatus(chalk.yellow("No previous sessions found."));
			return;
		}

		const items: SelectItem[] = sessions.map((s) => ({
			value: s.path,
			label: `${chalk.dim(this.formatRelativeTime(s.mtime))} ${s.preview}`,
		}));

		const selected = await this.showSelectList("Resume session", items);
		if (!selected) return;

		const session = sessions.find((s) => s.path === selected);
		if (!session) return;

		try {
			// Open the selected session and set on agent (auto-restores messages)
			const sessionDir = this.options.sessionDir!;
			const newSessionManager = SessionManagerClass.open(selected, sessionDir);
			this.agent.sessionManager = newSessionManager;

			// Rebuild the chat UI
			this.chatContainer.clear();
			this.rebuildChatFromSession();

			// Update footer tokens
			this.updateFooterTokens();

			const msgCount = this.agent.messages.length;
			this.showStatus(chalk.green(`Resumed session (${msgCount} messages)`));
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			this.showStatus(chalk.red(`Failed to resume session: ${msg}`));
		}
	}

	// ========================================================================
	// Select List (overlay pattern from pi-coding-agent)
	// ========================================================================

	private showSelectList(title: string, items: SelectItem[]): Promise<string | null> {
		return new Promise((resolve) => {
			const container = new Container();

			container.addChild(new Spacer(1));
			container.addChild(new Text(chalk.bold.cyan(title), 1, 0));

			const selectList = new SelectList(items, Math.min(items.length, 10), getSelectListTheme());
			selectList.onSelect = (item) => {
				// Restore normal UI
				this.pendingContainer.clear();
				this.editorContainer.addChild(this.editor);
				this.ui.setFocus(this.editor);
				this.ui.requestRender();
				resolve(item.value);
			};
			selectList.onCancel = () => {
				this.pendingContainer.clear();
				this.editorContainer.addChild(this.editor);
				this.ui.setFocus(this.editor);
				this.ui.requestRender();
				resolve(null);
			};
			container.addChild(selectList);
			container.addChild(new Text(chalk.dim("↑↓ navigate • enter select • esc cancel"), 1, 0));
			container.addChild(new Spacer(1));

			// Replace editor area with select list
			this.editorContainer.clear();
			this.pendingContainer.clear();
			this.pendingContainer.addChild(container);
			this.ui.setFocus(selectList);
			this.ui.requestRender();
		});
	}

	// ========================================================================
	// Status & Utilities
	// ========================================================================

	private showStatus(text: string): void {
		this.chatContainer.addChild(new Spacer(1));
		this.chatContainer.addChild(new Text(text, 1, 0));
		this.ui.requestRender();
	}

	private updateEditorBorderColor(): void {
		this.editorTheme.borderColor = this.isBashMode ? (s: string) => chalk.yellow(s) : (s: string) => chalk.gray(s);
		this.ui.requestRender();
	}

	private shutdown(): void {
		this.ui.stop();
		console.log(chalk.dim("\nGoodbye."));
		process.exit(0);
	}
}

// ============================================================================
// Helpers
// ============================================================================

function extractTextFromMessage(msg: ModelMessage): string {
	if (msg.role === "user") {
		const content = (msg as import("edge-pi").UserModelMessage).content;
		if (typeof content === "string") return content;
		if (Array.isArray(content)) {
			return content
				.filter((c): c is { type: "text"; text: string } => (c as { type: string }).type === "text")
				.map((c) => c.text)
				.join("");
		}
	}
	return "";
}
