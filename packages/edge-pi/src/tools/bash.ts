import { tool } from "ai";
import { z } from "zod";
import { createNodeRuntime } from "../runtime/node-runtime.js";
import type { EdgePiRuntime } from "../runtime/types.js";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from "./truncate.js";

const bashSchema = z.object({
	command: z.string().describe("Bash command to execute"),
	timeout: z.number().describe("Timeout in seconds (optional, no default timeout)").optional(),
});

interface ToolOptions {
	cwd: string;
	runtime?: EdgePiRuntime;
}

export function createBashTool(options: ToolOptions) {
	const runtime = options.runtime ?? createNodeRuntime();
	const cwd = options.cwd;
	return tool({
		description: `Execute a bash command in the current working directory. Returns stdout and stderr. Output is truncated to last ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). If truncated, full output is saved to a temp file. Optionally provide a timeout in seconds.`,
		inputSchema: bashSchema,
		execute: async ({ command, timeout }, { abortSignal }) => {
			if (!(await runtime.fs.exists(cwd))) {
				throw new Error(`Working directory does not exist: ${cwd}\nCannot execute bash commands.`);
			}
			const result = await runtime.exec(command, { cwd, timeoutSeconds: timeout, abortSignal });
			let output = result.output || "(no output)";
			if (result.truncated && result.fullOutputRef) {
				output += `\n\n[Output truncated (${formatSize(DEFAULT_MAX_BYTES)} limit). Full output: ${result.fullOutputRef}]`;
			}
			if (result.aborted) throw new Error(`${output}\n\nCommand aborted`);
			if (result.timedOut) throw new Error(`${output}\n\nCommand timed out after ${timeout} seconds`);
			if (result.exitCode !== 0 && result.exitCode !== null)
				throw new Error(`${output}\n\nCommand exited with code ${result.exitCode}`);
			return output;
		},
	});
}
