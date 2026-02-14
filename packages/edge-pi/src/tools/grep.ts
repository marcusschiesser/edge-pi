import { tool } from "ai";
import { z } from "zod";
import { toUtf8String } from "../runtime/encoding.js";
import { createNodeRuntime } from "../runtime/node-runtime.js";
import type { EdgePiRuntime } from "../runtime/types.js";
import { resolveToCwd } from "./path-utils.js";
import { DEFAULT_MAX_BYTES, formatSize, GREP_MAX_LINE_LENGTH, truncateHead, truncateLine } from "./truncate.js";

const grepSchema = z.object({
	pattern: z.string().describe("Search pattern (regex or literal string)"),
	path: z.string().describe("Directory or file to search (default: current directory)").optional(),
	glob: z.string().describe("Filter files by glob pattern").optional(),
	ignoreCase: z.boolean().describe("Case-insensitive search (default: false)").optional(),
	literal: z.boolean().describe("Treat pattern as literal string").optional(),
	context: z.number().describe("Number of lines before/after each match").optional(),
	limit: z.number().describe("Maximum number of matches (default: 100)").optional(),
});
const DEFAULT_LIMIT = 100;
interface ToolOptions {
	cwd: string;
	runtime?: EdgePiRuntime;
}

export function createGrepTool(options: ToolOptions) {
	const runtime = options.runtime ?? createNodeRuntime();
	const cwd = options.cwd;
	return tool({
		description: "Search file contents for a pattern.",
		inputSchema: grepSchema,
		execute: async ({ pattern, path: searchDir, glob, ignoreCase, literal, context, limit }, { abortSignal }) => {
			const searchPath = resolveToCwd(searchDir || ".", cwd, runtime);
			const effectiveLimit = Math.max(1, limit ?? DEFAULT_LIMIT);
			const flags = ["-n", "-H", "--hidden"];
			if (ignoreCase) flags.push("-i");
			if (literal) flags.push("-F");
			if (glob) flags.push(`-g ${JSON.stringify(glob)}`);
			const cmd = `rg ${flags.join(" ")} ${JSON.stringify(pattern)} ${JSON.stringify(searchPath)} | head -n ${effectiveLimit}`;
			const result = await runtime.exec(cmd, { cwd, abortSignal });
			if (!result.output.trim()) return "No matches found";
			let linesTruncated = false;
			const contextValue = context && context > 0 ? context : 0;
			const outputLines: string[] = [];
			for (const line of result.output.split("\n").filter(Boolean)) {
				const parts = line.split(":");
				if (parts.length < 3) continue;
				const lineNumber = Number(parts[1]);
				const text = parts.slice(2).join(":");
				const truncated = truncateLine(text);
				if (truncated.wasTruncated) linesTruncated = true;
				outputLines.push(`${parts[0]}:${lineNumber}: ${truncated.text}`);
				if (contextValue > 0) {
					const fileValue = await runtime.fs.readFile(parts[0], "utf-8");
					const fileLines = toUtf8String(fileValue).split(/\r?\n/);
					for (
						let ln = Math.max(1, lineNumber - contextValue);
						ln <= Math.min(fileLines.length, lineNumber + contextValue);
						ln++
					) {
						if (ln === lineNumber) continue;
						outputLines.push(`${parts[0]}-${ln}- ${fileLines[ln - 1] ?? ""}`);
					}
				}
			}
			const truncation = truncateHead(outputLines.join("\n"), { maxLines: Number.MAX_SAFE_INTEGER });
			let output = truncation.content;
			const notices: string[] = [];
			if (truncation.truncated) notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
			if (linesTruncated)
				notices.push(`Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars. Use read tool to see full lines`);
			if (notices.length > 0) output += `\n\n[${notices.join(". ")}]`;
			return output;
		},
	});
}
