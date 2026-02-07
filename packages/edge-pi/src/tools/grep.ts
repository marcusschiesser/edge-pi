/**
 * Grep tool - content search as Vercel AI tool().
 */

import { spawn } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { tool } from "ai";
import { z } from "zod";
import { resolveToCwd } from "./path-utils.js";
import { DEFAULT_MAX_BYTES, formatSize, GREP_MAX_LINE_LENGTH, truncateHead, truncateLine } from "./truncate.js";

const grepSchema = z.object({
	pattern: z.string().describe("Search pattern (regex or literal string)"),
	path: z.string().describe("Directory or file to search (default: current directory)").optional(),
	glob: z.string().describe("Filter files by glob pattern, e.g. '*.ts' or '**/*.spec.ts'").optional(),
	ignoreCase: z.boolean().describe("Case-insensitive search (default: false)").optional(),
	literal: z.boolean().describe("Treat pattern as literal string instead of regex (default: false)").optional(),
	context: z.number().describe("Number of lines to show before and after each match (default: 0)").optional(),
	limit: z.number().describe("Maximum number of matches to return (default: 100)").optional(),
});

const DEFAULT_LIMIT = 100;

/**
 * Find the ripgrep binary. Returns the path or null if not found.
 */
function findRg(): string | null {
	try {
		const { execSync } = require("node:child_process");
		const result = execSync("which rg", { encoding: "utf-8" }).trim();
		return result || null;
	} catch {
		return null;
	}
}

export function createGrepTool(cwd: string) {
	return tool({
		description: `Search file contents for a pattern. Returns matching lines with file paths and line numbers. Respects .gitignore. Output is truncated to ${DEFAULT_LIMIT} matches or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Long lines are truncated to ${GREP_MAX_LINE_LENGTH} chars.`,
		inputSchema: grepSchema,
		execute: async (
			{ pattern, path: searchDir, glob: globPattern, ignoreCase, literal, context, limit },
			{ abortSignal },
		) => {
			return new Promise<string>((resolve, reject) => {
				if (abortSignal?.aborted) {
					reject(new Error("Operation aborted"));
					return;
				}

				let settled = false;
				const settle = (fn: () => void) => {
					if (!settled) {
						settled = true;
						fn();
					}
				};

				(async () => {
					try {
						const rgPath = findRg();
						if (!rgPath) {
							settle(() => reject(new Error("ripgrep (rg) is not available. Please install it.")));
							return;
						}

						const searchPath = resolveToCwd(searchDir || ".", cwd);

						let isDirectory: boolean;
						try {
							isDirectory = statSync(searchPath).isDirectory();
						} catch (_err) {
							settle(() => reject(new Error(`Path not found: ${searchPath}`)));
							return;
						}

						const contextValue = context && context > 0 ? context : 0;
						const effectiveLimit = Math.max(1, limit ?? DEFAULT_LIMIT);

						const formatPath = (filePath: string): string => {
							if (isDirectory) {
								const relative = path.relative(searchPath, filePath);
								if (relative && !relative.startsWith("..")) {
									return relative.replace(/\\/g, "/");
								}
							}
							return path.basename(filePath);
						};

						const fileCache = new Map<string, string[]>();
						const getFileLines = (filePath: string): string[] => {
							let lines = fileCache.get(filePath);
							if (!lines) {
								try {
									const content = readFileSync(filePath, "utf-8");
									lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
								} catch {
									lines = [];
								}
								fileCache.set(filePath, lines);
							}
							return lines;
						};

						const args: string[] = ["--json", "--line-number", "--color=never", "--hidden"];

						if (ignoreCase) {
							args.push("--ignore-case");
						}

						if (literal) {
							args.push("--fixed-strings");
						}

						if (globPattern) {
							args.push("--glob", globPattern);
						}

						args.push(pattern, searchPath);

						const child = spawn(rgPath, args, { stdio: ["ignore", "pipe", "pipe"] });
						const rl = createInterface({ input: child.stdout! });
						let stderr = "";
						let matchCount = 0;
						let matchLimitReached = false;
						let linesTruncated = false;
						let aborted = false;
						let killedDueToLimit = false;

						const cleanup = () => {
							rl.close();
							abortSignal?.removeEventListener("abort", onAbort);
						};

						const stopChild = (dueToLimit: boolean = false) => {
							if (!child.killed) {
								killedDueToLimit = dueToLimit;
								child.kill();
							}
						};

						const onAbort = () => {
							aborted = true;
							stopChild();
						};

						abortSignal?.addEventListener("abort", onAbort, { once: true });

						child.stderr?.on("data", (chunk: Buffer) => {
							stderr += chunk.toString();
						});

						// Collect matches during streaming, format after
						const matches: Array<{ filePath: string; lineNumber: number }> = [];

						rl.on("line", (line) => {
							if (!line.trim() || matchCount >= effectiveLimit) {
								return;
							}

							let event: any;
							try {
								event = JSON.parse(line);
							} catch {
								return;
							}

							if (event.type === "match") {
								matchCount++;
								const filePath = event.data?.path?.text;
								const lineNumber = event.data?.line_number;

								if (filePath && typeof lineNumber === "number") {
									matches.push({ filePath, lineNumber });
								}

								if (matchCount >= effectiveLimit) {
									matchLimitReached = true;
									stopChild(true);
								}
							}
						});

						child.on("error", (error) => {
							cleanup();
							settle(() => reject(new Error(`Failed to run ripgrep: ${error.message}`)));
						});

						child.on("close", async (code) => {
							cleanup();

							if (aborted) {
								settle(() => reject(new Error("Operation aborted")));
								return;
							}

							if (!killedDueToLimit && code !== 0 && code !== 1) {
								const errorMsg = stderr.trim() || `ripgrep exited with code ${code}`;
								settle(() => reject(new Error(errorMsg)));
								return;
							}

							if (matchCount === 0) {
								settle(() => resolve("No matches found"));
								return;
							}

							// Format matches
							const outputLines: string[] = [];
							for (const match of matches) {
								const relativePath = formatPath(match.filePath);
								const lines = getFileLines(match.filePath);
								if (!lines.length) {
									outputLines.push(`${relativePath}:${match.lineNumber}: (unable to read file)`);
									continue;
								}

								const start =
									contextValue > 0 ? Math.max(1, match.lineNumber - contextValue) : match.lineNumber;
								const end =
									contextValue > 0
										? Math.min(lines.length, match.lineNumber + contextValue)
										: match.lineNumber;

								for (let current = start; current <= end; current++) {
									const lineText = lines[current - 1] ?? "";
									const sanitized = lineText.replace(/\r/g, "");
									const isMatchLine = current === match.lineNumber;

									const { text: truncatedText, wasTruncated } = truncateLine(sanitized);
									if (wasTruncated) {
										linesTruncated = true;
									}

									if (isMatchLine) {
										outputLines.push(`${relativePath}:${current}: ${truncatedText}`);
									} else {
										outputLines.push(`${relativePath}-${current}- ${truncatedText}`);
									}
								}
							}

							// Apply byte truncation
							const rawOutput = outputLines.join("\n");
							const truncation = truncateHead(rawOutput, { maxLines: Number.MAX_SAFE_INTEGER });

							let output = truncation.content;

							// Build notices
							const notices: string[] = [];

							if (matchLimitReached) {
								notices.push(
									`${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`,
								);
							}

							if (truncation.truncated) {
								notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
							}

							if (linesTruncated) {
								notices.push(
									`Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars. Use read tool to see full lines`,
								);
							}

							if (notices.length > 0) {
								output += `\n\n[${notices.join(". ")}]`;
							}

							settle(() => resolve(output));
						});
					} catch (err) {
						settle(() => reject(err as Error));
					}
				})();
			});
		},
	});
}
