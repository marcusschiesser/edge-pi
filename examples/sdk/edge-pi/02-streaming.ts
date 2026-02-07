/**
 * Simple Streaming Example
 *
 * Creates a CodingAgent and streams the response using textStream.
 * Text tokens are printed as they arrive. After the stream completes,
 * usage stats are printed.
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

console.log("Running agent (streaming)...\n");

const result = await agent.stream({
	prompt: "Read the package.json in the current directory and summarize what this project does.",
});

// Stream text tokens as they arrive
for await (const text of result.textStream) {
	process.stdout.write(text);
}

// After stream completes, print stats
const usage = await result.totalUsage;
const steps = await result.steps;

console.log("\n\n--- Stats ---");
console.log(`Steps: ${steps.length}`);
console.log(`Input tokens: ${usage.inputTokens}`);
console.log(`Output tokens: ${usage.outputTokens}`);
