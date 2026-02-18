/**
 * Vercel Sandbox Runtime Example
 *
 * Demonstrates running CodingAgent tools inside a Vercel Sandbox VM.
 */

import { openai } from "@ai-sdk/openai";
import { Sandbox } from "@vercel/sandbox";
import { stepCountIs } from "ai";
import { CodingAgent } from "edge-pi";
import { createVercelSandboxRuntime } from "edge-pi/vercel-sandbox";
import { printStream } from "./utils.js";

const model = openai("gpt-5.2-codex");

const sandbox = await Sandbox.create({
	runtime: "node24",
});

try {
	const runtime = createVercelSandboxRuntime(sandbox);
	const agent = new CodingAgent({
		model,
		runtime,
		stopWhen: stepCountIs(8),
	});

	const result = await agent.stream({
		prompt:
			"Run `pwd` and then create a file named runtime-check.txt with content 'sandbox works', and read it back.",
	});

	await printStream(result);
} finally {
	await sandbox.stop();
}
