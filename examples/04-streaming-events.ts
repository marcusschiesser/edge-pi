/**
 * Streaming Events Deep Dive
 *
 * Demonstrates all event types emitted by the Vercel AI SDK's fullStream.
 * Uses fullStream (instead of textStream) to observe every event in the
 * agent's tool loop: text generation, reasoning, tool calls, tool results,
 * step boundaries, and lifecycle events.
 *
 * Event types:
 *   Lifecycle:    start, finish, abort, error
 *   Steps:        start-step, finish-step
 *   Text:         text-start, text-delta, text-end
 *   Reasoning:    reasoning-start, reasoning-delta, reasoning-end
 *   Tool input:   tool-input-start, tool-input-delta, tool-input-end
 *   Tool exec:    tool-call, tool-result, tool-error
 */

import { anthropic } from "@ai-sdk/anthropic";
import { stepCountIs } from "ai";
import { CodingAgent } from "edge-pi";
import { printStream } from "./utils.js";

const model = anthropic("claude-sonnet-4-5-20250929");

const agent = new CodingAgent({
	model,
	stopWhen: stepCountIs(10),
	toolSet: "all",
});

console.log("=== Streaming Events Deep Dive ===\n");
console.log("Prompt: Find all TypeScript files in the current directory, count them,");
console.log("        and show the first 3 lines of the largest one.\n");
console.log("--- Event stream begins ---\n");

const result = await agent.stream({
	prompt:
		"Find all TypeScript files in the current directory (non-recursive). Count how many there are. Then find the largest one by file size and show its first 3 lines.",
});

await printStream(result);
