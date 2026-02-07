/**
 * Bash tool - executes shell commands as Vercel AI tool().
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tool } from "ai";
import { z } from "zod";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateTail } from "./truncate.js";

/**
 * Generate a unique temp file path for bash output.
 */
function getTempFilePath(): string {
	const id = randomBytes(8).toString("hex");
	return join(tmpdir(), `edge-pi-bash-${id}.log`);
}

/**
 * Get shell configuration for the current platform.
 */
function getShellConfig(): { shell: string; args: string[] } {
	const shell = process.env.SHELL || "/bin/bash";
	return { shell, args: ["-c"] };
}

/**
 * Get environment for shell execution.
 */
function getShellEnv(): NodeJS.ProcessEnv {
	return { ...process.env };
}

/**
 * Kill a process and all its children.
 */
function killProcessTree(pid: number): void {
	try {
		process.kill(-pid, "SIGTERM");
	} catch {
		try {
			process.kill(pid, "SIGTERM");
		} catch {
			// Process already dead
		}
	}
}

const bashSchema = z.object({
	command: z.string().describe("Bash command to execute"),
	timeout: z.number().describe("Timeout in seconds (optional, no default timeout)").optional(),
});

export function createBashTool(cwd: string) {
	return tool({
		description: `Execute a bash command in the current working directory. Returns stdout and stderr. Output is truncated to last ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). If truncated, full output is saved to a temp file. Optionally provide a timeout in seconds.`,
		inputSchema: bashSchema,
		execute: async ({ command, timeout }, { abortSignal }) => {
			return new Promise<string>((resolve, reject) => {
				const { shell, args } = getShellConfig();

				if (!existsSync(cwd)) {
					reject(new Error(`Working directory does not exist: ${cwd}\nCannot execute bash commands.`));
					return;
				}

				const child = spawn(shell, [...args, command], {
					cwd,
					detached: true,
					env: getShellEnv(),
					stdio: ["ignore", "pipe", "pipe"],
				});

				let timedOut = false;

				// Set timeout if provided
				let timeoutHandle: NodeJS.Timeout | undefined;
				if (timeout !== undefined && timeout > 0) {
					timeoutHandle = setTimeout(() => {
						timedOut = true;
						if (child.pid) {
							killProcessTree(child.pid);
						}
					}, timeout * 1000);
				}

				// We'll stream to a temp file if output gets large
				let tempFilePath: string | undefined;
				let tempFileStream: ReturnType<typeof createWriteStream> | undefined;
				let totalBytes = 0;

				// Keep a rolling buffer of the last chunks for tail truncation
				const chunks: Buffer[] = [];
				let chunksBytes = 0;
				const maxChunksBytes = DEFAULT_MAX_BYTES * 2;

				const handleData = (data: Buffer) => {
					totalBytes += data.length;

					// Start writing to temp file once we exceed the threshold
					if (totalBytes > DEFAULT_MAX_BYTES && !tempFilePath) {
						tempFilePath = getTempFilePath();
						tempFileStream = createWriteStream(tempFilePath);
						for (const chunk of chunks) {
							tempFileStream.write(chunk);
						}
					}

					// Write to temp file if we have one
					if (tempFileStream) {
						tempFileStream.write(data);
					}

					// Keep rolling buffer of recent data
					chunks.push(data);
					chunksBytes += data.length;

					// Trim old chunks if buffer is too large
					while (chunksBytes > maxChunksBytes && chunks.length > 1) {
						const removed = chunks.shift()!;
						chunksBytes -= removed.length;
					}
				};

				// Stream stdout and stderr
				if (child.stdout) {
					child.stdout.on("data", handleData);
				}
				if (child.stderr) {
					child.stderr.on("data", handleData);
				}

				// Handle shell spawn errors
				child.on("error", (err) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					if (abortSignal) abortSignal.removeEventListener("abort", onAbort);
					reject(err);
				});

				// Handle abort signal - kill entire process tree
				const onAbort = () => {
					if (child.pid) {
						killProcessTree(child.pid);
					}
				};

				if (abortSignal) {
					if (abortSignal.aborted) {
						onAbort();
					} else {
						abortSignal.addEventListener("abort", onAbort, { once: true });
					}
				}

				// Handle process exit
				child.on("close", (code) => {
					if (timeoutHandle) clearTimeout(timeoutHandle);
					if (abortSignal) abortSignal.removeEventListener("abort", onAbort);

					// Close temp file stream
					if (tempFileStream) {
						tempFileStream.end();
					}

					if (abortSignal?.aborted) {
						const fullBuffer = Buffer.concat(chunks);
						let output = fullBuffer.toString("utf-8");
						if (output) output += "\n\n";
						output += "Command aborted";
						reject(new Error(output));
						return;
					}

					if (timedOut) {
						const fullBuffer = Buffer.concat(chunks);
						let output = fullBuffer.toString("utf-8");
						if (output) output += "\n\n";
						output += `Command timed out after ${timeout} seconds`;
						reject(new Error(output));
						return;
					}

					// Combine all buffered chunks
					const fullBuffer = Buffer.concat(chunks);
					const fullOutput = fullBuffer.toString("utf-8");

					// Apply tail truncation
					const truncation = truncateTail(fullOutput);
					let outputText = truncation.content || "(no output)";

					if (truncation.truncated) {
						// Build actionable notice
						const startLine = truncation.totalLines - truncation.outputLines + 1;
						const endLine = truncation.totalLines;

						if (truncation.lastLinePartial) {
							const lastLineSize = formatSize(Buffer.byteLength(fullOutput.split("\n").pop() || "", "utf-8"));
							outputText += `\n\n[Showing last ${formatSize(truncation.outputBytes)} of line ${endLine} (line is ${lastLineSize}). Full output: ${tempFilePath}]`;
						} else if (truncation.truncatedBy === "lines") {
							outputText += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines}. Full output: ${tempFilePath}]`;
						} else {
							outputText += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Full output: ${tempFilePath}]`;
						}
					}

					if (code !== 0 && code !== null) {
						outputText += `\n\nCommand exited with code ${code}`;
						reject(new Error(outputText));
					} else {
						resolve(outputText);
					}
				});
			});
		},
	});
}
