import { tool } from "ai";
import { z } from "zod";
import type { EdgePiRuntime } from "../runtime/types.js";
import { resolveCwd, resolveToCwd } from "./path-utils.js";

const writeSchema = z.object({
	path: z.string().describe("Path to the file to write (relative or absolute)"),
	content: z.string().describe("Content to write to the file"),
});

interface ToolOptions {
	cwd: string;
	runtime: EdgePiRuntime;
}

export function createWriteTool(options: ToolOptions) {
	const runtime = options.runtime;
	const cwd = resolveCwd(options.cwd, runtime);
	return tool({
		description:
			"Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.",
		inputSchema: writeSchema,
		execute: async ({ path, content }, { abortSignal }) => {
			const absolutePath = resolveToCwd(path, cwd, runtime);
			if (abortSignal?.aborted) throw new Error("Operation aborted");
			await runtime.fs.mkdir(runtime.path.dirname(absolutePath), { recursive: true });
			if (abortSignal?.aborted) throw new Error("Operation aborted");
			try {
				await runtime.fs.writeFile(absolutePath, content, "utf-8");
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`Failed to write file: ${path} (resolved: ${absolutePath})\n${message}`);
			}
			return `Successfully wrote ${content.length} bytes to ${path}`;
		},
	});
}
