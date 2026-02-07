/**
 * Find tool - file search by glob pattern as Vercel AI tool().
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { tool } from "ai";
import { globSync } from "glob";
import { z } from "zod";
import { resolveToCwd } from "./path-utils.js";
import { DEFAULT_MAX_BYTES, formatSize, truncateHead } from "./truncate.js";

const findSchema = z.object({
	pattern: z.string().describe("Glob pattern to match files, e.g. '*.ts', '**/*.json', or 'src/**/*.spec.ts'"),
	path: z.string().describe("Directory to search in (default: current directory)").optional(),
	limit: z.number().describe("Maximum number of results (default: 1000)").optional(),
});

const DEFAULT_LIMIT = 1000;

/**
 * Find the fd binary. Returns the path or null if not found.
 */
function findFd(): string | null {
	try {
		const { execSync } = require("node:child_process");
		const result = execSync("which fd", { encoding: "utf-8" }).trim();
		return result || null;
	} catch {
		return null;
	}
}

export function createFindTool(cwd: string) {
	return tool({
		description: `Search for files by glob pattern. Returns matching file paths relative to the search directory. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} results or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first).`,
		inputSchema: findSchema,
		execute: async ({ pattern, path: searchDir, limit }, { abortSignal }) => {
			if (abortSignal?.aborted) {
				throw new Error("Operation aborted");
			}

			const searchPath = resolveToCwd(searchDir || ".", cwd);
			const effectiveLimit = limit ?? DEFAULT_LIMIT;

			// Try fd first
			const fdPath = findFd();
			if (fdPath) {
				// Build fd arguments
				const args: string[] = ["--glob", "--color=never", "--hidden", "--max-results", String(effectiveLimit)];

				// Include .gitignore files
				const gitignoreFiles = new Set<string>();
				const rootGitignore = path.join(searchPath, ".gitignore");
				if (existsSync(rootGitignore)) {
					gitignoreFiles.add(rootGitignore);
				}

				try {
					const nestedGitignores = globSync("**/.gitignore", {
						cwd: searchPath,
						dot: true,
						absolute: true,
						ignore: ["**/node_modules/**", "**/.git/**"],
					});
					for (const file of nestedGitignores) {
						gitignoreFiles.add(file);
					}
				} catch {
					// Ignore glob errors
				}

				for (const gitignorePath of gitignoreFiles) {
					args.push("--ignore-file", gitignorePath);
				}

				args.push(pattern, searchPath);

				const result = spawnSync(fdPath, args, {
					encoding: "utf-8",
					maxBuffer: 10 * 1024 * 1024,
				});

				if (result.error) {
					throw new Error(`Failed to run fd: ${result.error.message}`);
				}

				const output = result.stdout?.trim() || "";

				if (result.status !== 0) {
					const errorMsg = result.stderr?.trim() || `fd exited with code ${result.status}`;
					if (!output) {
						throw new Error(errorMsg);
					}
				}

				if (!output) {
					return "No files found matching pattern";
				}

				const lines = output.split("\n");
				const relativized: string[] = [];

				for (const rawLine of lines) {
					const line = rawLine.replace(/\r$/, "").trim();
					if (!line) continue;

					const hadTrailingSlash = line.endsWith("/") || line.endsWith("\\");
					let relativePath = line;
					if (line.startsWith(searchPath)) {
						relativePath = line.slice(searchPath.length + 1);
					} else {
						relativePath = path.relative(searchPath, line);
					}

					if (hadTrailingSlash && !relativePath.endsWith("/")) {
						relativePath += "/";
					}

					relativized.push(relativePath);
				}

				return formatFindResults(relativized, effectiveLimit);
			}

			// Fallback to glob
			if (!existsSync(searchPath)) {
				throw new Error(`Path not found: ${searchPath}`);
			}

			const results = globSync(pattern, {
				cwd: searchPath,
				dot: true,
				ignore: ["**/node_modules/**", "**/.git/**"],
			}).slice(0, effectiveLimit);

			if (results.length === 0) {
				return "No files found matching pattern";
			}

			return formatFindResults(results, effectiveLimit);
		},
	});
}

function formatFindResults(relativized: string[], effectiveLimit: number): string {
	const resultLimitReached = relativized.length >= effectiveLimit;
	const rawOutput = relativized.join("\n");
	const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });

	let resultOutput = truncation.content;
	const notices: string[] = [];

	if (resultLimitReached) {
		notices.push(
			`${effectiveLimit} results limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`,
		);
	}

	if (truncation.truncated) {
		notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
	}

	if (notices.length > 0) {
		resultOutput += `\n\n[${notices.join(". ")}]`;
	}

	return resultOutput;
}
