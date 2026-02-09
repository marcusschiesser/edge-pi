import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_MAX_LINES = 2000;
const DEFAULT_MAX_BYTES = 50 * 1024;

export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function truncateTail(
	content: string,
	options: { maxLines?: number; maxBytes?: number } = {},
): {
	content: string;
	truncated: boolean;
	truncatedBy: "lines" | "bytes" | null;
	totalLines: number;
	totalBytes: number;
	outputLines: number;
	outputBytes: number;
} {
	const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

	const totalBytes = Buffer.byteLength(content, "utf-8");
	const lines = content.split("\n");
	const totalLines = lines.length;

	if (totalLines <= maxLines && totalBytes <= maxBytes) {
		return {
			content,
			truncated: false,
			truncatedBy: null,
			totalLines,
			totalBytes,
			outputLines: totalLines,
			outputBytes: totalBytes,
		};
	}

	const outLines: string[] = [];
	let outBytes = 0;
	let truncatedBy: "lines" | "bytes" = "lines";

	for (let i = lines.length - 1; i >= 0 && outLines.length < maxLines; i--) {
		const line = lines[i];
		const lineBytes = Buffer.byteLength(line, "utf-8") + (outLines.length > 0 ? 1 : 0);
		if (outBytes + lineBytes > maxBytes) {
			truncatedBy = "bytes";
			break;
		}
		outLines.unshift(line);
		outBytes += lineBytes;
	}

	const out = outLines.join("\n");
	return {
		content: out,
		truncated: true,
		truncatedBy,
		totalLines,
		totalBytes,
		outputLines: outLines.length,
		outputBytes: Buffer.byteLength(out, "utf-8"),
	};
}

export interface BashExecutionResult {
	output: string;
	exitCode: number | undefined;
	cancelled: boolean;
	truncated: boolean;
	fullOutputPath?: string;
}

export interface ExecuteBashCommandOptions {
	cwd?: string;
	/** Kill the process tree on abort. */
	signal?: AbortSignal;
	/** Called for each raw output chunk (stdout and stderr). */
	onChunk?: (chunk: string) => void;
	/** Max captured output. Defaults to edge-pi tool limits. */
	maxLines?: number;
	maxBytes?: number;
}

function getTempFilePath(): string {
	const id = randomBytes(8).toString("hex");
	return join(tmpdir(), `edge-pi-cli-inline-bash-${id}.log`);
}

function killProcessTree(pid: number): void {
	try {
		process.kill(-pid, "SIGTERM");
	} catch {
		try {
			process.kill(pid, "SIGTERM");
		} catch {
			// ignore
		}
	}
}

export async function executeBashCommand(
	command: string,
	options: ExecuteBashCommandOptions = {},
): Promise<BashExecutionResult> {
	const cwd = options.cwd ?? process.cwd();
	const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
	const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;

	return new Promise<BashExecutionResult>((resolve, reject) => {
		const child = spawn("bash", ["-c", command], {
			cwd,
			detached: true,
			env: { ...process.env },
			stdio: ["ignore", "pipe", "pipe"],
		});

		let cancelled = false;

		let tempFilePath: string | undefined;
		let tempFileStream: ReturnType<typeof createWriteStream> | undefined;
		let totalBytes = 0;

		const chunks: Buffer[] = [];
		let chunksBytes = 0;
		const maxChunksBytes = maxBytes * 2;

		const handleData = (data: Buffer) => {
			options.onChunk?.(data.toString("utf-8"));

			totalBytes += data.length;

			if (totalBytes > maxBytes && !tempFilePath) {
				tempFilePath = getTempFilePath();
				tempFileStream = createWriteStream(tempFilePath);
				for (const chunk of chunks) {
					tempFileStream.write(chunk);
				}
			}

			if (tempFileStream) {
				tempFileStream.write(data);
			}

			chunks.push(data);
			chunksBytes += data.length;

			while (chunksBytes > maxChunksBytes && chunks.length > 1) {
				const removed = chunks.shift();
				if (removed) chunksBytes -= removed.length;
			}
		};

		child.stdout?.on("data", handleData);
		child.stderr?.on("data", handleData);

		const onAbort = () => {
			cancelled = true;
			if (child.pid) {
				killProcessTree(child.pid);
			}
		};

		if (options.signal) {
			if (options.signal.aborted) {
				onAbort();
			} else {
				options.signal.addEventListener("abort", onAbort, { once: true });
			}
		}

		child.on("error", (err) => {
			if (options.signal) options.signal.removeEventListener("abort", onAbort);
			reject(err);
		});

		child.on("close", (code, sig) => {
			if (options.signal) options.signal.removeEventListener("abort", onAbort);
			if (tempFileStream) tempFileStream.end();

			const fullOutput = Buffer.concat(chunks).toString("utf-8");
			const truncation = truncateTail(fullOutput, { maxBytes, maxLines });

			let outputText = truncation.content;
			if (cancelled || sig) {
				resolve({
					output: outputText,
					exitCode: code === null ? undefined : code,
					cancelled: true,
					truncated: truncation.truncated,
					fullOutputPath: tempFilePath,
				});
				return;
			}

			if (truncation.truncated) {
				const startLine = truncation.totalLines - truncation.outputLines + 1;
				const endLine = truncation.totalLines;
				outputText += `\n\n[Showing lines ${startLine}-${endLine} of ${truncation.totalLines} (${formatSize(maxBytes)} limit). Full output: ${tempFilePath}]`;
			}

			resolve({
				output: outputText,
				exitCode: code === null ? undefined : code,
				cancelled: false,
				truncated: truncation.truncated,
				fullOutputPath: tempFilePath,
			});
		});
	});
}
