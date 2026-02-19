/**
 * Simple Non-Streaming Example
 *
 * Creates a CodingAgent with an Anthropic model and runs a single generate call.
 * The agent uses tools (read, bash, edit, write) to answer the question,
 * then returns the final result.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { stepCountIs } from "ai";
import { CodingAgent } from "edge-pi";
import { createNodeRuntime } from "edge-pi/node";

const agent = new CodingAgent({
	model: anthropic("claude-sonnet-4-5-20250929"),
	runtime: createNodeRuntime(),
	stopWhen: stepCountIs(5),
});

console.log("Running agent (non-streaming)...\n");

const result = await agent.generate({
	prompt: "What files are in the current directory? List them with their sizes.",
});

console.log("--- Assistant Response ---");
console.log(result.text);
console.log("\n--- Stats ---");
console.log(`Steps: ${result.steps.length}`);
console.log(`Input tokens: ${result.totalUsage.inputTokens}`);
console.log(`Output tokens: ${result.totalUsage.outputTokens}`);
