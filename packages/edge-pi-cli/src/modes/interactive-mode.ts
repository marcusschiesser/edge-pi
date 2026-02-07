/**
 * Interactive mode: Streaming readline REPL.
 *
 * Simple terminal-based interactive loop that streams responses
 * and shows tool usage inline.
 */

import { createInterface } from "node:readline";
import chalk from "chalk";
import type { CodingAgent, ModelMessage, SessionManager } from "edge-pi";
import type { Skill } from "../skills.js";

export interface InteractiveModeOptions {
	initialMessage?: string;
	initialMessages?: string[];
	sessionManager?: SessionManager;
	skills?: Skill[];
	verbose?: boolean;
	provider: string;
	modelId: string;
}

/**
 * Run the interactive REPL mode with streaming output.
 */
export async function runInteractiveMode(agent: CodingAgent, options: InteractiveModeOptions): Promise<void> {
	const { initialMessage, initialMessages = [], sessionManager, skills = [], verbose, provider, modelId } = options;

	console.log(chalk.bold("epi") + chalk.dim(` - ${provider}/${modelId}`));
	if (skills.length > 0 && verbose) {
		console.log(chalk.dim(`Skills: ${skills.map((s) => s.name).join(", ")}`));
	}
	if (sessionManager?.getSessionFile()) {
		if (verbose) {
			console.log(chalk.dim(`Session: ${sessionManager.getSessionFile()}`));
		}
	}
	console.log(chalk.dim('Type your message. Press Ctrl+C to exit. Type "/skills" to list skills.\n'));

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
