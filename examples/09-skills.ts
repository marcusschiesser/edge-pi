/**
 * Skills with Structured Prompt Inputs
 *
 * Demonstrates passing pre-loaded skills to the SDK via systemPromptOptions.
 * File-based skill discovery stays outside the SDK (for example in a CLI).
 */

import { fileURLToPath } from "node:url";
import { anthropic } from "@ai-sdk/anthropic";
import { CodingAgent } from "edge-pi";
import { createNodeRuntime } from "edge-pi/node";
import { printStream } from "./utils.js";

const agent = new CodingAgent({
	model: anthropic("claude-sonnet-4-5"),
	runtime: createNodeRuntime(),
	systemPromptOptions: {
		skills: {
			codeReview: {
				description: "Performs a focused code review for correctness and edge cases.",
				filePath: fileURLToPath(new URL("./skills/code-review/SKILL.md", import.meta.url)),
			},
		},
	},
});

const result = await agent.stream({
	prompt:
		"Using the available skills, review this function and suggest fixes:\n\nfunction toInt(value: string) { return parseInt(value); }",
});

await printStream(result);
