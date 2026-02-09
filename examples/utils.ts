import type { StreamTextResult } from "ai";

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

export interface PrintStreamedEventsOptions {
	header?: string;
	showSummary?: boolean;
	maxToolOutputChars?: number;
}

/**
 * Print all events from a Vercel AI SDK StreamTextResult.fullStream.
 *
 * This is primarily meant for examples and debugging.
 */
export async function printStream(
	result: StreamTextResult<any, any>,
	options: PrintStreamedEventsOptions = {},
): Promise<void> {
	const { header, showSummary = true, maxToolOutputChars = 120 } = options;

	if (header) {
		console.log(bold(header));
	}

	let stepNumber = 0;
	let toolCallCount = 0;
	const startTime = Date.now();

	for await (const event of result.fullStream) {
		switch (event.type) {
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

			case "start-step":
				stepNumber++;
				console.log(
					`\n${bold(yellow(` Step ${stepNumber} `))}${event.warnings.length > 0 ? dim(` warnings: ${JSON.stringify(event.warnings)}`) : ""}`,
				);
				break;

			case "finish-step":
				console.log(
					`${yellow(` Step ${stepNumber} done `)} reason=${event.finishReason}${dim(` input=${event.usage.inputTokens} output=${event.usage.outputTokens}`)}`,
				);
				break;

			case "text-start":
				process.stdout.write(green("[text] "));
				break;

			case "text-delta":
				process.stdout.write(event.text);
				break;

			case "text-end":
				process.stdout.write("\n");
				break;

			case "reasoning-start":
				process.stdout.write(magenta("[reasoning] "));
				break;

			case "reasoning-delta":
				process.stdout.write(dim(event.text));
				break;

			case "reasoning-end":
				process.stdout.write("\n");
				break;

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

			case "tool-call":
				console.log(
					`${cyan("[tool-call]")} ${event.toolName}(${truncate(JSON.stringify(event.input), maxToolOutputChars)})`,
				);
				break;

			case "tool-result": {
				const output = typeof event.output === "string" ? event.output : JSON.stringify(event.output);
				console.log(`${green("[tool-result]")} ${event.toolName}  ${truncate(output, maxToolOutputChars)}`);
				break;
			}

			case "tool-error":
				console.log(`${red("[tool-error]")} ${event.toolName}: ${event.error}`);
				break;

			case "tool-output-denied":
				console.log(`${red("[tool-denied]")} ${event.toolName}: output denied`);
				break;

			case "source":
				console.log(dim(`[source] ${(event as unknown as { url?: string }).url ?? "unknown"}`));
				break;

			case "file":
				console.log(dim(`[file] (${event.file.mediaType})`));
				break;

			default:
				console.log(dim(`[${(event as unknown as { type: string }).type}] (unhandled)`));
				break;
		}
	}

	if (!showSummary) return;

	const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
	const usage = await result.totalUsage;
	const steps = await result.steps;

	console.log(bold("=== Summary ==="));
	console.log(`Duration:    ${elapsed}s`);
	console.log(`Steps:       ${steps.length}`);
	console.log(`Tool calls:  ${toolCallCount}`);
	console.log(`Input:       ${usage.inputTokens} tokens`);
	console.log(`Output:      ${usage.outputTokens} tokens`);
}
