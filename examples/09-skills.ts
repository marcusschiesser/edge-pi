/**
 * Skills with Structured Prompt Inputs
 *
 * Demonstrates passing pre-loaded skills to the SDK via systemPromptOptions.
 * File-based skill discovery stays outside the SDK (for example in a CLI).
 */

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { anthropic } from "@ai-sdk/anthropic";
import { stepCountIs } from "ai";
import type { Skill } from "edge-pi";
import { CodingAgent } from "edge-pi";
import { printStream } from "./utils.js";

const skillFilePath = fileURLToPath(new URL("./skills/code-review/SKILL.md", import.meta.url));

const skills: Skill[] = [
	{
		name: "code-review",
		description: "Performs a focused code review for correctness and edge cases.",
		filePath: skillFilePath,
		baseDir: dirname(skillFilePath),
		source: "example",
		disableModelInvocation: false,
	},
];

const agent = new CodingAgent({
	model: anthropic("claude-sonnet-4-5"),
	stopWhen: stepCountIs(5),
	systemPromptOptions: {
		skills,
	},
});

const result = await agent.stream({
	prompt:
		"Using the available skills, review this function and suggest fixes:\n\nfunction toInt(value: string) { return parseInt(value); }",
});

await printStream(result);
