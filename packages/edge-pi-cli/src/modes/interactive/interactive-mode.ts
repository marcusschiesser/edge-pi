/**
 * Interactive mode using @mariozechner/pi-tui.
 *
 * Replaces the old readline-based REPL with a proper TUI that matches
 * the UX patterns from @mariozechner/pi-coding-agent:
 * - Editor component for input with submit/escape handling
 * - Markdown rendering for assistant responses
 * - Tool execution components with collapsible output
 * - Footer with model/provider info
 * - Container-based layout (header → chat → pending → editor → footer)
 */

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
import chalk from "chalk";
import type { CodingAgent, ModelMessage, SessionManager } from "edge-pi";
import type { AuthStorage } from "../../auth/auth-storage.js";
import type { ContextFile } from "../../context.js";
import type { PromptTemplate } from "../../prompts.js";
import { expandPromptTemplate } from "../../prompts.js";
import type { Skill } from "../../skills.js";
import { AssistantMessageComponent } from "./components/assistant-message.js";
import { FooterComponent } from "./components/footer.js";
import { ToolExecutionComponent } from "./components/tool-execution.js";
import { UserMessageComponent } from "./components/user-message.js";
import { getEditorTheme, getMarkdownTheme, getSelectListTheme } from "./theme.js";

export interface InteractiveModeOptions {
	initialMessage?: string;
	initialMessages?: string[];
	sessionManager?: SessionManager;
	skills?: Skill[];
	contextFiles?: ContextFile[];
	prompts?: PromptTemplate[];
	verbose?: boolean;
	provider: string;
	modelId: string;
	authStorage?: AuthStorage;
	/** Path to the `fd` binary for @ file autocomplete, or undefined if unavailable. */
	fdPath?: string;
	/** Called when the user switches model via Ctrl+L. Returns a new agent for the new model. */
	onModelChange?: (provider: string, modelId: string) => Promise<CodingAgent>;
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
	private editorContainer!: Container;
	private editor!: Editor;
	private footer!: FooterComponent;

	// Loading animation during agent processing
	private loadingAnimation: Loader | undefined = undefined;

	// Streaming state
	private streamingComponent: AssistantMessageComponent | undefined = undefined;
	private streamingText = "";

	// Tool execution tracking: toolCallId → component
	private pendingTools = new Map<string, ToolExecutionComponent>();

	// Tool output expansion state
	private toolOutputExpanded = false;

	// Callback for resolving user input promise
	private onInputCallback?: (text: string) => void;

	constructor(agent: CodingAgent, options: InteractiveModeOptions) {
		this.agent = agent;
		this.options = options;
		this.currentProvider = options.provider;
		this.currentModelId = options.modelId;
	}

	async run(): Promise<void> {
		this.initUI();

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
		const { provider, modelId, skills = [], contextFiles = [], prompts = [], verbose, sessionManager } = this.options;

		this.ui = new TUI(new ProcessTerminal());

		// Header
		this.headerContainer = new Container();
		const logo = chalk.bold("epi") + chalk.dim(` - ${provider}/${modelId}`);

		const hints = [
			`${chalk.dim("Escape")} to abort`,
			`${chalk.dim("Ctrl+D")} to exit (empty)`,
			`${chalk.dim("Ctrl+E")} to expand tools`,
			`${chalk.dim("Ctrl+L")} to switch model`,
			`${chalk.dim("@")} for file references`,
			`${chalk.dim("/")} for commands`,
		].join("\n");

		this.headerContainer.addChild(new Spacer(1));
		this.headerContainer.addChild(new Text(`${logo}\n${hints}`, 1, 0));
		this.headerContainer.addChild(new Spacer(1));

		if (verbose && sessionManager?.getSessionFile()) {
			this.headerContainer.addChild(new Text(chalk.dim(`Session: ${sessionManager.getSessionFile()}`), 1, 0));
		}

		// Show loaded context, skills, and prompts at startup
		this.showLoadedResources(contextFiles, skills, prompts);

		// Chat area
		this.chatContainer = new Container();

		// Pending messages (loading animations, status)
		this.pendingContainer = new Container();

		// Editor with slash command autocomplete
		this.editor = new Editor(this.ui, getEditorTheme());
		this.editor.setAutocompleteProvider(this.buildAutocompleteProvider());
		this.editorContainer = new Container();
		this.editorContainer.addChild(this.editor);

		// Footer
		this.footer = new FooterComponent(this.currentProvider, this.currentModelId);

		// Assemble layout
		this.ui.addChild(this.headerContainer);
		this.ui.addChild(this.chatContainer);
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
		this.editor.onSubmit = (text: string) => {
			text = text.trim();
			if (!text) return;

			this.editor.setText("");

			if (this.onInputCallback) {
				this.onInputCallback(text);
			}
		};

		const origHandleInput = this.editor.handleInput.bind(this.editor);
		this.editor.handleInput = (data: string) => {
			// Escape: abort if agent is running
			if (matchesKey(data, Key.escape)) {
				if (this.loadingAnimation) {
					this.agent.abort();
					this.stopLoading();
					return;
				}
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

		if (input.startsWith("/skill:")) {
			const skillName = input.slice("/skill:".length).trim();
			await this.handleSkillInvocation(skillName);
			return;
		}

		// Try expanding prompt templates
		const { prompts = [] } = this.options;
		const expanded = expandPromptTemplate(input, prompts);

		// Regular message (use expanded text if a prompt template was matched)
		this.chatContainer.addChild(new UserMessageComponent(expanded, getMarkdownTheme()));
		this.ui.requestRender();
		await this.streamPrompt(expanded);
	}

	// ========================================================================
	// Autocomplete
	// ========================================================================

	private buildAutocompleteProvider(): CombinedAutocompleteProvider {
		const { skills = [], prompts = [], fdPath } = this.options;

		const commands: SlashCommand[] = [
			{ name: "help", description: "Show available commands" },
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
		const modelOptions: { provider: string; modelId: string; label: string }[] = [
			{ provider: "anthropic", modelId: "claude-sonnet-4-20250514", label: "anthropic/claude-sonnet-4" },
			{ provider: "anthropic", modelId: "claude-haiku-3-5-20241022", label: "anthropic/claude-haiku-3.5" },
			{ provider: "anthropic", modelId: "claude-opus-4-20250514", label: "anthropic/claude-opus-4" },
			{ provider: "openai", modelId: "gpt-4o", label: "openai/gpt-4o" },
			{ provider: "openai", modelId: "gpt-4o-mini", label: "openai/gpt-4o-mini" },
			{ provider: "openai", modelId: "o3-mini", label: "openai/o3-mini" },
			{ provider: "google", modelId: "gemini-2.5-flash", label: "google/gemini-2.5-flash" },
			{ provider: "google", modelId: "gemini-2.5-pro", label: "google/gemini-2.5-pro" },
		];

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

			this.currentProvider = newProvider;
			this.currentModelId = newModelId;
			this.footer = new FooterComponent(this.currentProvider, this.currentModelId);

			// Replace footer in UI
			const children = this.ui.children;
			children[children.length - 1] = this.footer;

			this.showStatus(chalk.green(`Switched to ${newProvider}/${newModelId}`));
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			this.showStatus(chalk.red(`Failed to switch model: ${msg}`));
		}
	}

	// ========================================================================
	// Streaming
	// ========================================================================

	private async streamPrompt(prompt: string): Promise<void> {
		const { sessionManager } = this.options;
		const messagesBefore = this.agent.messages.length;

		// Start loading animation
		this.startLoading();

		// Create assistant message component
		this.streamingComponent = new AssistantMessageComponent(getMarkdownTheme());
		this.streamingText = "";

		try {
			const result = await this.agent.stream({ prompt });

			// Stop loading animation once streaming starts
			this.stopLoading();

			// Add the streaming component to chat
			this.chatContainer.addChild(this.streamingComponent);
			this.ui.requestRender();

			for await (const part of result.fullStream) {
				switch (part.type) {
					case "text-delta":
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
							const outputStr = typeof part.output === "string" ? part.output : JSON.stringify(part.output);
							toolComponent.updateResult(outputStr, /* isError */ false, /* isPartial */ false);
							this.pendingTools.delete(part.toolCallId);
							this.ui.requestRender();
						}
						break;
					}
				}
			}

			// Get final response and update messages
			const response = await result.response;
			const responseMessages = response.messages as ModelMessage[];
			this.agent.setMessages([
				...this.agent.messages.slice(0, messagesBefore),
				...buildUserMessage(prompt),
				...responseMessages,
			]);

			// Save to session
			if (sessionManager) {
				const userMsg: ModelMessage = {
					role: "user",
					content: [{ type: "text", text: prompt }],
				};
				sessionManager.appendMessage(userMsg);
				for (const msg of responseMessages) {
					sessionManager.appendMessage(msg);
				}
			}
		} catch (error) {
			this.stopLoading();

			if ((error as Error).name === "AbortError") {
				if (this.streamingComponent) {
					this.streamingComponent.setAborted();
				} else {
					this.showStatus(chalk.dim("[aborted]"));
				}
			} else {
				const msg = (error as Error).message;
				if (this.streamingComponent) {
					this.streamingComponent.setError(msg);
				} else {
					this.showStatus(chalk.red(`Error: ${msg}`));
				}
			}
		} finally {
			this.streamingComponent = undefined;
			this.streamingText = "";
			this.pendingTools.clear();
			this.ui.requestRender();
		}
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

		// Update all tool components in the chat
		this.applyToAllToolComponents((comp) => {
			comp.setExpanded(this.toolOutputExpanded);
		});

		this.ui.requestRender();
	}

	private applyToAllToolComponents(fn: (comp: ToolExecutionComponent) => void): void {
		for (const child of this.chatContainer.children) {
			if (child instanceof ToolExecutionComponent) {
				fn(child);
			}
		}
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

	private shutdown(): void {
		this.ui.stop();
		console.log(chalk.dim("\nGoodbye."));
		process.exit(0);
	}
}

// ============================================================================
// Helpers
// ============================================================================

function buildUserMessage(text: string): ModelMessage[] {
	return [{ role: "user" as const, content: [{ type: "text" as const, text }] }];
}
