/**
 * Compaction Example
 *
 * Demonstrates built-in CodingAgent compaction with:
 * - auto compaction checks after generate()/stream()
 * - manual compaction via agent.compact()
 * - compaction lifecycle callbacks
 */

import { anthropic } from "@ai-sdk/anthropic";
import { stepCountIs } from "ai";
import { CodingAgent, SessionManager } from "edge-pi";

const model = anthropic("claude-sonnet-4-5-20250929");
const session = SessionManager.create(process.cwd(), "./sessions");

const agent = new CodingAgent({
	model,
	stopWhen: stepCountIs(3),
	sessionManager: session,
	compaction: {
		// Intentionally small window so compaction triggers in a short demo.
		contextWindow: 1200,
		mode: "auto",
		settings: {
			reserveTokens: 400,
			keepRecentTokens: 300,
		},
		onCompactionStart: () => {
			console.log("\n[compaction] started");
		},
		onCompactionComplete: (result) => {
			console.log(`[compaction] done (tokens before: ${result.tokensBefore})`);
		},
		onCompactionError: (error) => {
			console.log(`[compaction] failed: ${error.message}`);
		},
	},
});

console.log("Streaming first prompt...\n");
const first = await agent.stream({
	prompt: "Read package.json and summarize the project in 3 bullet points. Include one point about dependencies.",
});

for await (const text of first.textStream) {
	process.stdout.write(text);
}
console.log("\n");

console.log("Streaming second prompt (likely to trigger auto compaction)...\n");
const second = await agent.stream({
	prompt:
		"Now read README.md and compare it with your previous summary. Keep the answer concise but include concrete details.",
});

for await (const text of second.textStream) {
	process.stdout.write(text);
}
console.log("\n");

console.log("Switching to manual mode and compacting explicitly...\n");
if (agent.compaction) {
	agent.setCompaction({ ...agent.compaction, mode: "manual" });
}
const manualResult = await agent.compact();

if (!manualResult) {
	console.log("No manual compaction was needed.");
}

console.log(`Session file: ${session.getSessionFile()}`);
