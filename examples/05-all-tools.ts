/**
 * All Tools Example
 *
 * Demonstrates enabling the full built-in tool set.
 * This includes: read, bash, edit, write, grep, find, ls.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { stepCountIs } from "ai";
import { CodingAgent } from "edge-pi";
import { printStream } from "./utils.js";

const model = anthropic("claude-sonnet-4-5-20250929");

const agent = new CodingAgent({
	model,
	stopWhen: stepCountIs(8),
	toolSet: "all",
});

console.log("Running agent with toolSet=all...\n");

const result = await agent.stream({
	prompt:
		"Search for 'toolSet' usage in this repo and summarize where it is configured. Use grep/find/ls where appropriate.",
});

await printStream(result);
