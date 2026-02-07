/**
 * Write tool - file creation/overwrite as Vercel AI tool().
 */

import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { resolveToCwd } from "./path-utils.js";

const writeSchema = z.object({
	path: z.string().describe("Path to the file to write (relative or absolute)"),
	content: z.string().describe("Content to write to the file"),
});

export function createWriteTool(cwd: string) {
	return tool({
		description:
			"Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.",
		inputSchema: writeSchema,
		execute: async ({ path, content }, { abortSignal }) => {
			const absolutePath = resolveToCwd(path, cwd);
			const dir = dirname(absolutePath);

			// Check abort
			if (abortSignal?.aborted) {
				throw new Error("Operation aborted");
			}

			// Create parent directories if needed
			await fs.mkdir(dir, { recursive: true });

			// Check abort before writing
			if (abortSignal?.aborted) {
				throw new Error("Operation aborted");
			}

			// Write the file
			await fs.writeFile(absolutePath, content, "utf-8");

			return `Successfully wrote ${content.length} bytes to ${path}`;
		},
	});
}
