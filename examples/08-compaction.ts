/**
 * Compaction Example
 *
 * Demonstrates built-in CodingAgent compaction with:
 * - manual compaction mode
 * - one model call plus seeded session history to build enough context
 * - message count before and after compaction
 */

import { anthropic } from "@ai-sdk/anthropic";
import { CodingAgent } from "edge-pi";
import { createNodeRuntime } from "edge-pi/node";
import { SessionManager } from "edge-pi/session";

const model = anthropic("claude-sonnet-4-5");
const session = SessionManager.inMemory();

const agent = new CodingAgent({
	model,
	runtime: createNodeRuntime(),
	sessionManager: session,
	compaction: {
		// Small window so a single run can exceed compaction threshold.
		contextWindow: 2000,
		mode: "manual",
		settings: {
			reserveTokens: 1200,
			// Keep only a small recent slice so older messages are summarized.
			keepRecentTokens: 80,
		},
		onCompactionStart: () => {
			console.log("\n[compaction] started");
		},
		onCompactionComplete: (result) => {
			console.log(`[compaction] done (tokens before: ${result.tokensBefore})`);
		},
	},
});

await agent.generate({
	prompt: "Do not use tools. Write 8 concise bullets about designing robust TypeScript CLIs.",
});
await agent.generate({
	prompt: "Do not use tools. Add one more section with 3 concrete failure-handling examples.",
});

console.log(`Context messages before manual compaction: ${session.buildSessionContext().messages.length}`);

const manualResult = await agent.compact();

if (!manualResult) {
	console.log("No manual compaction was needed.");
}

console.log(`Context messages after manual compaction: ${session.buildSessionContext().messages.length}`);
