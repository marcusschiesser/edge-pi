import { tool } from "ai";
import { z } from "zod";
import { createNodeRuntime } from "../runtime/node-runtime.js";
import type { EdgePiRuntime } from "../runtime/types.js";
import { resolveToCwd } from "./path-utils.js";
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from "./truncate.js";

const findSchema = z.object({
	pattern: z.string().describe("Glob pattern to match files"),
	path: z.string().describe("Directory to search in (default: current directory)").optional(),
	limit: z.number().describe("Maximum number of results (default: 1000)").optional(),
});
const DEFAULT_LIMIT = 1000;
interface ToolOptions {
	cwd: string;
	runtime?: EdgePiRuntime;
}

export function createFindTool(options: ToolOptions) {
	const runtime = options.runtime ?? createNodeRuntime();
	const cwd = options.cwd;
	return tool({
		description: `Search for files by glob pattern. Output is truncated to ${DEFAULT_LIMIT} results or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).`,
		inputSchema: findSchema,
		execute: async ({ pattern, path: searchDir, limit }, { abortSignal }) => {
			if (abortSignal?.aborted) throw new Error("Operation aborted");
			const searchPath = resolveToCwd(searchDir || ".", cwd, runtime);
			const effectiveLimit = limit ?? DEFAULT_LIMIT;
			const cmd = `rg --files -g ${JSON.stringify(pattern)} . | head -n ${effectiveLimit}`;
			const result = await runtime.exec(cmd, { cwd: searchPath, abortSignal });
			if (result.exitCode !== 0 && !result.output.trim()) {
				return "No files found matching pattern";
			}
			const lines = result.output
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean);
			if (lines.length === 0) return "No files found matching pattern";
			const normalizedSearchPath = searchPath.endsWith("/") ? searchPath.slice(0, -1) : searchPath;
			const relativeLines = lines.map((line) =>
				line.startsWith(`${normalizedSearchPath}/`)
					? line.slice(normalizedSearchPath.length + 1)
					: line.startsWith("./")
						? line.slice(2)
						: line,
			);
			const truncation = truncateHead(relativeLines.join("\n"), { maxLines: Number.MAX_SAFE_INTEGER });
			let out = truncation.content;
			if (truncation.truncated) out += `\n\n[${formatSize(DEFAULT_MAX_BYTES)} limit reached]`;
			return out;
		},
	});
}
