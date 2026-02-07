/**
 * Simple Non-Streaming Example
 *
 * Creates a CodingAgent with an Anthropic model and runs a single prompt.
 * The agent uses tools (read, bash, edit, write) to answer the question,
 * then returns the final result.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { CodingAgent } from "edge-pi";

const anthropic = createAnthropic();
const model = anthropic("claude-sonnet-4-5-20250929");

const agent = new CodingAgent({
	model,
	maxSteps: 5,
	toolSet: "coding",
});

console.log("Running agent (non-streaming)...\n");

const result = await agent.prompt({
	prompt: "What files are in the current directory? List them with their sizes.",
});

console.log("--- Assistant Response ---");
console.log(result.text);
console.log("\n--- Stats ---");
console.log(`Steps: ${result.stepCount}`);
console.log(`Input tokens: ${result.totalUsage.inputTokens}`);
console.log(`Output tokens: ${result.totalUsage.outputTokens}`);
