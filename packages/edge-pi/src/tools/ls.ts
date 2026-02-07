/**
 * Ls tool - directory listing as Vercel AI tool().
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import nodePath from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { resolveToCwd } from "./path-utils.js";
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from "./truncate.js";

const lsSchema = z.object({
	path: z.string().describe("Directory to list (default: current directory)").optional(),
	limit: z.number().describe("Maximum number of entries to return (default: 500)").optional(),
});

const DEFAULT_LIMIT = 500;

export function createLsTool(cwd: string) {
	return tool({
		description: `List directory contents. Returns entries sorted alphabetically, with '/' suffix for directories. Includes dotfiles. Output is truncated to ${DEFAULT_LIMIT} entries or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).`,
		inputSchema: lsSchema,
		execute: async ({ path, limit }, { abortSignal }) => {
			if (abortSignal?.aborted) {
				throw new Error("Operation aborted");
			}

			const dirPath = resolveToCwd(path || ".", cwd);
			const effectiveLimit = limit ?? DEFAULT_LIMIT;

			// Check if path exists
			if (!existsSync(dirPath)) {
				throw new Error(`Path not found: ${dirPath}`);
			}

			// Check if path is a directory
			const stat = statSync(dirPath);
			if (!stat.isDirectory()) {
				throw new Error(`Not a directory: ${dirPath}`);
			}

			// Read directory entries
			let entries: string[];
			try {
				entries = readdirSync(dirPath);
			} catch (e: any) {
				throw new Error(`Cannot read directory: ${e.message}`);
			}

			// Sort alphabetically (case-insensitive)
			entries.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

			// Format entries with directory indicators
			const results: string[] = [];
			let entryLimitReached = false;

			for (const entry of entries) {
				if (results.length >= effectiveLimit) {
					entryLimitReached = true;
					break;
				}

				const fullPath = nodePath.join(dirPath, entry);
				let suffix = "";

				try {
					const entryStat = statSync(fullPath);
					if (entryStat.isDirectory()) {
						suffix = "/";
					}
				} catch {
					// Skip entries we can't stat
					continue;
				}

				results.push(entry + suffix);
			}

			if (results.length === 0) {
				return "(empty directory)";
			}

			// Apply byte truncation
			const rawOutput = results.join("\n");
			const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });

			let output = truncation.content;

			// Build notices
			const notices: string[] = [];

			if (entryLimitReached) {
				notices.push(`${effectiveLimit} entries limit reached. Use limit=${effectiveLimit * 2} for more`);
			}

			if (truncation.truncated) {
				notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
			}

			if (notices.length > 0) {
				output += `\n\n[${notices.join(". ")}]`;
			}

			return output;
		},
	});
}
