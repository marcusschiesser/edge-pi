import { tool } from "ai";
import { z } from "zod";
import { createNodeRuntime } from "../runtime/node-runtime.js";
import type { EdgePiRuntime } from "../runtime/types.js";
import { resolveToCwd } from "./path-utils.js";

const writeSchema = z.object({
	path: z.string().describe("Path to the file to write (relative or absolute)"),
	content: z.string().describe("Content to write to the file"),
});

interface ToolOptions {
	cwd: string;
	runtime?: EdgePiRuntime;
}

export function createWriteTool(options: ToolOptions) {
	const runtime = options.runtime ?? createNodeRuntime();
	const cwd = options.cwd;
	return tool({
		description:
			"Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.",
		inputSchema: writeSchema,
		execute: async ({ path, content }, { abortSignal }) => {
			const absolutePath = resolveToCwd(path, cwd, runtime);
			if (abortSignal?.aborted) throw new Error("Operation aborted");
			await runtime.fs.mkdir(runtime.path.dirname(absolutePath), { recursive: true });
			if (abortSignal?.aborted) throw new Error("Operation aborted");
			await runtime.fs.writeFile(absolutePath, content, "utf-8");
			return `Successfully wrote ${content.length} bytes to ${path}`;
		},
	});
}
