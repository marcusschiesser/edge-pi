/**
 * Print mode (single-shot): Send prompts, output result, exit.
 *
 * Used for:
 * - `epi -p "prompt"` - text output
 * - `epi --mode json "prompt"` - JSON event stream
 */

import type { CodingAgent, SessionManager } from "edge-pi";

export interface PrintModeOptions {
	mode: "text" | "json";
	messages: string[];
	initialMessage?: string;
	sessionManager?: SessionManager;
}

/**
 * Run in print (single-shot) mode.
 * Sends prompts to the agent and outputs the result.
 */
export async function runPrintMode(agent: CodingAgent, options: PrintModeOptions): Promise<void> {
	const { mode, messages, initialMessage, sessionManager } = options;

	const allMessages: string[] = [];
	if (initialMessage) {
		allMessages.push(initialMessage);
	}
	allMessages.push(...messages);

	if (allMessages.length === 0) {
		console.error("No prompt provided. Use -p with a message.");
		process.exit(1);
	}

	for (const message of allMessages) {
		const result = await agent.generate({ prompt: message });

		// Save messages to session
		if (sessionManager) {
			const agentMessages = [...agent.messages];
			for (const msg of agentMessages.slice(agent.messages.length - agentMessages.length)) {
				sessionManager.appendMessage(msg);
			}
		}

		if (mode === "json") {
			console.log(
				JSON.stringify({
					type: "result",
					text: result.text,
					stepCount: result.steps.length,
					usage: result.totalUsage,
				}),
			);
		} else {
			if (result.text) {
				console.log(result.text);
			}
		}
	}

	// Flush stdout
	await new Promise<void>((resolve, reject) => {
		process.stdout.write("", (err) => {
			if (err) reject(err);
			else resolve();
		});
	});
}
