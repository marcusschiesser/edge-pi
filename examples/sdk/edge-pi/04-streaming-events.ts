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

import { createAnthropic } from "@ai-sdk/anthropic";
import { stepCountIs } from "ai";
import { CodingAgent } from "edge-pi";

// --- Helpers for colored terminal output ---

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const magenta = (s: string) => `\x1b[35m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

function truncate(s: string, max = 120): string {
	const oneLine = s.replace(/\n/g, "\\n");
	return oneLine.length > max ? `${oneLine.slice(0, max)}...` : oneLine;
}

// --- Setup ---

const anthropic = createAnthropic();
const model = anthropic("claude-sonnet-4-5-20250929");

const agent = new CodingAgent({
	model,
	stopWhen: stepCountIs(10),
	toolSet: "all",
});

console.log(bold("=== Streaming Events Deep Dive ===\n"));
console.log("Prompt: Find all TypeScript files in the current directory, count them,");
console.log("        and show the first 3 lines of the largest one.\n");
console.log(dim("--- Event stream begins ---\n"));

const result = await agent.stream({
	prompt:
		"Find all TypeScript files in the current directory (non-recursive). Count how many there are. Then find the largest one by file size and show its first 3 lines.",
});

let stepNumber = 0;
let toolCallCount = 0;
const startTime = Date.now();

for await (const event of result.fullStream) {
	switch (event.type) {
		// ── Lifecycle ────────────────────────────────────────────────
		case "start":
			console.log(`${cyan("[start]")}${dim(" Stream started")}`);
			break;

		case "finish":
			console.log(
				`${cyan("[finish]")} reason=${event.finishReason}${dim(` total_input=${event.totalUsage.inputTokens} total_output=${event.totalUsage.outputTokens}`)}`,
			);
			break;

		case "abort":
			console.log(`${red("[abort]")} reason=${event.reason ?? "unknown"}`);
			break;

		case "error":
			console.log(`${red("[error]")} ${event.error}`);
			break;

		// ── Step boundaries ──────────────────────────────────────────
		case "start-step":
			stepNumber++;
			console.log(
				`\n${bold(yellow(`── Step ${stepNumber} ──`))}${event.warnings.length > 0 ? dim(` warnings: ${JSON.stringify(event.warnings)}`) : ""}`,
			);
			break;

		case "finish-step":
			console.log(
				`${yellow(`── Step ${stepNumber} done ──`)} reason=${event.finishReason}${dim(` input=${event.usage.inputTokens} output=${event.usage.outputTokens}`)}`,
			);
			break;

		// ── Text generation ──────────────────────────────────────────
		case "text-start":
			process.stdout.write(green("[text] "));
			break;

		case "text-delta":
			process.stdout.write(event.text);
			break;

		case "text-end":
			process.stdout.write("\n");
			break;

		// ── Reasoning (extended thinking) ────────────────────────────
		case "reasoning-start":
			process.stdout.write(magenta("[reasoning] "));
			break;

		case "reasoning-delta":
			process.stdout.write(dim(event.text));
			break;

		case "reasoning-end":
			process.stdout.write("\n");
			break;

		// ── Tool input streaming ─────────────────────────────────────
		case "tool-input-start":
			toolCallCount++;
			process.stdout.write(`${cyan(`[tool:${event.toolName}] `)}${dim("input: ")}`);
			break;

		case "tool-input-delta":
			process.stdout.write(dim(event.delta));
			break;

		case "tool-input-end":
			process.stdout.write("\n");
			break;

		// ── Tool execution ───────────────────────────────────────────
		case "tool-call":
			console.log(`${cyan("[tool-call]")} ${event.toolName}(${truncate(JSON.stringify(event.input))})`);
			break;

		case "tool-result": {
			const output = typeof event.output === "string" ? event.output : JSON.stringify(event.output);
			console.log(`${green("[tool-result]")} ${event.toolName} → ${truncate(output)}`);
			break;
		}

		case "tool-error":
			console.log(`${red("[tool-error]")} ${event.toolName}: ${event.error}`);
			break;

		case "tool-output-denied":
			console.log(`${red("[tool-denied]")} ${event.toolName}: output denied`);
			break;

		// ── Other events ─────────────────────────────────────────────
		case "source":
			console.log(dim(`[source] ${(event as any).url ?? "unknown"}`));
			break;

		case "file":
			console.log(dim(`[file] (${event.file.mediaType})`));
			break;

		default:
			// Future event types we don't handle yet
			console.log(dim(`[${(event as any).type}] (unhandled)`));
			break;
	}
}

// ── Summary ────────────────────────────────────────────────────

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
const usage = await result.totalUsage;
const steps = await result.steps;

console.log(`\n${dim("--- Event stream ended ---")}\n`);
console.log(bold("=== Summary ==="));
console.log(`Duration:    ${elapsed}s`);
console.log(`Steps:       ${steps.length}`);
console.log(`Tool calls:  ${toolCallCount}`);
console.log(`Input:       ${usage.inputTokens} tokens`);
console.log(`Output:      ${usage.outputTokens} tokens`);
