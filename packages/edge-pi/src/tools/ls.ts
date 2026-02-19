import { tool } from "ai";
import { z } from "zod";
import type { EdgePiRuntime } from "../runtime/types.js";
import { resolveCwd, resolveToCwd } from "./path-utils.js";
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from "./truncate.js";

const lsSchema = z.object({
	path: z.string().describe("Directory to list (default: current directory)").optional(),
	limit: z.number().describe("Maximum number of entries to return (default: 500)").optional(),
});
const DEFAULT_LIMIT = 500;
interface ToolOptions {
	cwd: string;
	runtime: EdgePiRuntime;
}

export function createLsTool(options: ToolOptions) {
	const runtime = options.runtime;
	const cwd = resolveCwd(options.cwd, runtime);
	return tool({
		description: `List directory contents. Returns entries sorted alphabetically, with '/' suffix for directories. Includes dotfiles. Output is truncated to ${DEFAULT_LIMIT} entries or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).`,
		inputSchema: lsSchema,
		execute: async ({ path, limit }, { abortSignal }) => {
			if (abortSignal?.aborted) throw new Error("Operation aborted");
			const dirPath = resolveToCwd(path || ".", cwd, runtime);
			if (!(await runtime.fs.exists(dirPath))) throw new Error(`Path not found: ${dirPath}`);
			if (!(await runtime.fs.stat(dirPath)).isDirectory()) throw new Error(`Not a directory: ${dirPath}`);
			const entries = await runtime.fs.readdir(dirPath);
			entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
			const results: string[] = [];
			const effectiveLimit = limit ?? DEFAULT_LIMIT;
			let entryLimitReached = false;
			for (const entry of entries) {
				if (results.length >= effectiveLimit) {
					entryLimitReached = true;
					break;
				}
				try {
					const st = await runtime.fs.stat(runtime.path.join(dirPath, entry));
					results.push(`${entry}${st.isDirectory() ? "/" : ""}`);
				} catch {}
			}
			if (results.length === 0) return "(empty directory)";
			const truncation = truncateHead(results.join("\n"), { maxLines: Number.MAX_SAFE_INTEGER });
			let output = truncation.content;
			const notices: string[] = [];
			if (entryLimitReached)
				notices.push(`${effectiveLimit} entries limit reached. Use limit=${effectiveLimit * 2} for more`);
			if (truncation.truncated) notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
			if (notices.length > 0) output += `\n\n[${notices.join(". ")}]`;
			return output;
		},
	});
}
