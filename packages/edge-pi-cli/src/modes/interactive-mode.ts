/**
 * Interactive mode: Streaming readline REPL.
 *
 * Simple terminal-based interactive loop that streams responses
 * and shows tool usage inline. Supports /login and /logout commands.
 */

import { createInterface } from "node:readline";
import chalk from "chalk";
import type { CodingAgent, ModelMessage, SessionManager } from "edge-pi";
import type { AuthStorage } from "../auth/auth-storage.js";
import type { Skill } from "../skills.js";

export interface InteractiveModeOptions {
	initialMessage?: string;
	initialMessages?: string[];
	sessionManager?: SessionManager;
	skills?: Skill[];
	verbose?: boolean;
	provider: string;
	modelId: string;
	authStorage?: AuthStorage;
}

/**
 * Run the interactive REPL mode with streaming output.
 */
export async function runInteractiveMode(agent: CodingAgent, options: InteractiveModeOptions): Promise<void> {
	const {
		initialMessage,
		initialMessages = [],
		sessionManager,
		skills = [],
		verbose,
		provider,
		modelId,
		authStorage,
	} = options;

	console.log(chalk.bold("epi") + chalk.dim(` - ${provider}/${modelId}`));
	if (skills.length > 0 && verbose) {
		console.log(chalk.dim(`Skills: ${skills.map((s) => s.name).join(", ")}`));
	}
	if (sessionManager?.getSessionFile()) {
		if (verbose) {
			console.log(chalk.dim(`Session: ${sessionManager.getSessionFile()}`));
		}
	}
	console.log(chalk.dim('Type your message. Press Ctrl+C to exit. Type "/help" for commands.\n'));

	// Process initial messages first (non-interactive)
	const initialMsgs: string[] = [];
	if (initialMessage) {
		initialMsgs.push(initialMessage);
	}
	initialMsgs.push(...initialMessages);

	for (const msg of initialMsgs) {
		console.log(chalk.green("> ") + msg);
		await streamPrompt(agent, msg, sessionManager);
		console.log();
	}

	// Start interactive loop
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const promptForInput = (): Promise<string | null> => {
		return new Promise((resolve) => {
			rl.question(chalk.green("> "), (answer) => {
				resolve(answer);
			});
			rl.once("close", () => resolve(null));
		});
	};

	const askQuestion = (question: string): Promise<string> => {
		return new Promise((resolve) => {
			rl.question(question, (answer) => {
				resolve(answer);
			});
		});
	};

	try {
		while (true) {
			const input = await promptForInput();

			// EOF or Ctrl+C
			if (input === null) {
				break;
			}

			const trimmed = input.trim();
			if (!trimmed) continue;

			// Handle commands
			if (trimmed === "/help") {
				console.log(chalk.bold("Commands:"));
				console.log("  /login              Login to an OAuth provider");
				console.log("  /logout             Logout from an OAuth provider");
				console.log("  /skills             List loaded skills");
				console.log("  /skill:<name>       Invoke a skill by name");
				console.log("  /quit, /exit        Exit the CLI");
				console.log();
				continue;
			}

			if (trimmed === "/skills") {
				if (skills.length === 0) {
					console.log(chalk.dim("No skills loaded."));
				} else {
					for (const skill of skills) {
						const hidden = skill.disableModelInvocation ? chalk.dim(" (hidden from model)") : "";
						console.log(`  ${chalk.bold(skill.name)}${hidden}`);
						console.log(chalk.dim(`    ${skill.description}`));
						console.log(chalk.dim(`    ${skill.filePath}`));
					}
				}
				console.log();
				continue;
			}

			if (trimmed === "/quit" || trimmed === "/exit") {
				break;
			}

			if (trimmed === "/login") {
				await handleLogin(authStorage, rl, askQuestion);
				console.log();
				continue;
			}

			if (trimmed === "/logout") {
				await handleLogout(authStorage, rl, askQuestion);
				console.log();
				continue;
			}

			if (trimmed.startsWith("/skill:")) {
				const skillName = trimmed.slice("/skill:".length).trim();
				const skill = skills.find((s) => s.name === skillName);
				if (!skill) {
					console.log(chalk.red(`Skill "${skillName}" not found.`));
					console.log();
					continue;
				}
				// Inject the skill file content as a user message
				const skillPrompt = `Please read and follow the instructions in the skill file: ${skill.filePath}`;
				await streamPrompt(agent, skillPrompt, sessionManager);
				console.log();
				continue;
			}

			await streamPrompt(agent, trimmed, sessionManager);
			console.log();
		}
	} finally {
		rl.close();
	}

	console.log(chalk.dim("\nGoodbye."));
}

/**
 * Handle /login command - text-based OAuth login flow.
 */
async function handleLogin(
	authStorage: AuthStorage | undefined,
	_rl: ReturnType<typeof createInterface>,
	askQuestion: (q: string) => Promise<string>,
): Promise<void> {
	if (!authStorage) {
		console.log(chalk.red("Auth storage not available."));
		return;
	}

	const providers = authStorage.getProviders();
	if (providers.length === 0) {
		console.log(chalk.dim("No OAuth providers registered."));
		return;
	}

	// Show provider selection
	console.log(chalk.bold("Available OAuth providers:"));
	for (let i = 0; i < providers.length; i++) {
		const p = providers[i];
		const loggedIn = authStorage.get(p.id)?.type === "oauth" ? chalk.green(" (logged in)") : "";
		console.log(`  ${i + 1}. ${p.name}${loggedIn}`);
	}

	const choice = await askQuestion(chalk.dim("Select provider (number): "));
	const index = parseInt(choice.trim(), 10) - 1;

	if (Number.isNaN(index) || index < 0 || index >= providers.length) {
		console.log(chalk.dim("Cancelled."));
		return;
	}

	const provider = providers[index];
	console.log(chalk.dim(`\nLogging in to ${provider.name}...\n`));

	try {
		await authStorage.login(provider.id, {
			onAuth: (info) => {
				console.log(chalk.bold("Open this URL in your browser:"));
				console.log(chalk.cyan(info.url));
				if (info.instructions) {
					console.log(chalk.dim(info.instructions));
				}
				console.log();

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
			onPrompt: async (prompt) => {
				const answer = await askQuestion(chalk.dim(`${prompt.message} `));
				return answer.trim();
			},
			onProgress: (message) => {
				console.log(chalk.dim(message));
			},
		});

		console.log(chalk.green(`\nLogged in to ${provider.name}. Credentials saved.`));
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		if (msg !== "Login cancelled") {
			console.log(chalk.red(`Login failed: ${msg}`));
		} else {
			console.log(chalk.dim("Login cancelled."));
		}
	}
}

/**
 * Handle /logout command.
 */
async function handleLogout(
	authStorage: AuthStorage | undefined,
	_rl: ReturnType<typeof createInterface>,
	askQuestion: (q: string) => Promise<string>,
): Promise<void> {
	if (!authStorage) {
		console.log(chalk.red("Auth storage not available."));
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
		console.log(chalk.dim("No OAuth providers logged in. Use /login first."));
		return;
	}

	console.log(chalk.bold("Logged in providers:"));
	for (let i = 0; i < loggedIn.length; i++) {
		console.log(`  ${i + 1}. ${loggedIn[i].name}`);
	}

	const choice = await askQuestion(chalk.dim("Select provider to logout (number): "));
	const index = parseInt(choice.trim(), 10) - 1;

	if (Number.isNaN(index) || index < 0 || index >= loggedIn.length) {
		console.log(chalk.dim("Cancelled."));
		return;
	}

	const entry = loggedIn[index];
	authStorage.logout(entry.id);
	console.log(chalk.green(`Logged out of ${entry.name}.`));
}

/**
 * Extract a string field from a tool call's input object.
 */
function getInputField(input: unknown, field: string): string {
	if (typeof input === "object" && input !== null && field in input) {
		return String((input as Record<string, unknown>)[field]);
	}
	return "";
}

/**
 * Send a prompt and stream the response to the terminal.
 */
async function streamPrompt(agent: CodingAgent, prompt: string, sessionManager?: SessionManager): Promise<void> {
	const messagesBefore = agent.messages.length;

	try {
		const result = await agent.stream({ prompt });

		for await (const part of result.fullStream) {
			switch (part.type) {
				case "text-delta":
					process.stdout.write(part.text);
					break;
				case "tool-call":
					process.stdout.write(chalk.dim(`\n[${part.toolName}] `));
					if (part.toolName === "bash") {
						process.stdout.write(chalk.dim(getInputField(part.input, "command").slice(0, 120)));
					} else if (part.toolName === "read" || part.toolName === "write" || part.toolName === "edit") {
						const fp = getInputField(part.input, "file_path") || getInputField(part.input, "filePath");
						process.stdout.write(chalk.dim(fp));
					} else if (part.toolName === "grep" || part.toolName === "find") {
						process.stdout.write(chalk.dim(getInputField(part.input, "pattern")));
					}
					process.stdout.write("\n");
					break;
				case "tool-result":
					// Show brief summary of tool result
					if (part.output) {
						const resultStr = typeof part.output === "string" ? part.output : JSON.stringify(part.output);
						const lines = resultStr.split("\n");
						const preview =
							lines.length > 3 ? `${lines.slice(0, 3).join("\n")}... (${lines.length} lines)` : resultStr;
						if (preview.length > 200) {
							process.stdout.write(chalk.dim(`  ${preview.slice(0, 200)}...\n`));
						} else if (preview) {
							process.stdout.write(chalk.dim(`  ${preview}\n`));
						}
					}
					break;
			}
		}

		// Ensure newline after streaming
		process.stdout.write("\n");

		// Get final response and update messages
		const response = await result.response;
		const responseMessages = response.messages as ModelMessage[];
		agent.setMessages([...agent.messages.slice(0, messagesBefore), ...buildUserMessage(prompt), ...responseMessages]);

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
		if ((error as Error).name === "AbortError") {
			console.log(chalk.dim("\n[aborted]"));
			return;
		}
		console.error(chalk.red(`\nError: ${(error as Error).message}`));
	}
}

function buildUserMessage(text: string): ModelMessage[] {
	return [{ role: "user" as const, content: [{ type: "text" as const, text }] }];
}
