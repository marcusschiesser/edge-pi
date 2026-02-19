import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { constants, createWriteStream, promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateTail } from "../tools/truncate.js";
import type { EdgePiRuntime, ExecOptions, ExecResult } from "./types.js";
import { createWorkspacePathResolver } from "./workspace-path-resolver.js";

function getTempFilePath(): string {
	const id = randomBytes(8).toString("hex");
	return path.join(os.tmpdir(), `edge-pi-bash-${id}.log`);
}

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

async function exec(command: string, options?: ExecOptions): Promise<ExecResult> {
	const cwd = options?.cwd ?? process.cwd();
	const timeout = options?.timeoutSeconds;
	const abortSignal = options?.abortSignal;

	return new Promise<ExecResult>((resolve, reject) => {
		const shell = process.env.SHELL || "/bin/bash";
		const child = spawn(shell, ["-c", command], {
			cwd,
			detached: true,
			env: { ...process.env },
			stdio: ["ignore", "pipe", "pipe"],
		});

		let timedOut = false;
		let timeoutHandle: NodeJS.Timeout | undefined;
		if (timeout !== undefined && timeout > 0) {
			timeoutHandle = setTimeout(() => {
				timedOut = true;
				if (child.pid) {
					killProcessTree(child.pid);
				}
			}, timeout * 1000);
		}

		let tempFilePath: string | undefined;
		let tempFileStream: ReturnType<typeof createWriteStream> | undefined;
		let totalBytes = 0;
		const chunks: Buffer[] = [];
		let chunksBytes = 0;
		const maxChunksBytes = DEFAULT_MAX_BYTES * 2;

		const handleData = (data: Buffer) => {
			totalBytes += data.length;
			if (totalBytes > DEFAULT_MAX_BYTES && !tempFilePath) {
				tempFilePath = getTempFilePath();
				tempFileStream = createWriteStream(tempFilePath);
				for (const chunk of chunks) tempFileStream.write(chunk);
			}
			if (tempFileStream) tempFileStream.write(data);
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
			if (child.pid) killProcessTree(child.pid);
		};
		if (abortSignal) {
			if (abortSignal.aborted) onAbort();
			else abortSignal.addEventListener("abort", onAbort, { once: true });
		}

		child.on("error", (err) => {
			if (timeoutHandle) clearTimeout(timeoutHandle);
			abortSignal?.removeEventListener("abort", onAbort);
			reject(err);
		});

		child.on("close", (exitCode) => {
			if (timeoutHandle) clearTimeout(timeoutHandle);
			abortSignal?.removeEventListener("abort", onAbort);
			tempFileStream?.end();

			const fullOutput = Buffer.concat(chunks).toString("utf-8");
			const truncation = truncateTail(fullOutput, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
			resolve({
				output: truncation.content || "",
				exitCode,
				truncated: truncation.truncated,
				fullOutputRef: tempFilePath,
				timedOut,
				aborted: abortSignal?.aborted ?? false,
			});
		});
	});
}

export function createNodeRuntime(): EdgePiRuntime {
	const rootdir = process.cwd();
	const resolveWorkspacePath = createWorkspacePathResolver({
		rootdir,
		resolvePath: (...parts: string[]) => path.resolve(...parts),
		finalizeAbsolute: (absolutePath: string) => path.resolve(absolutePath),
	});

	function readFile(filePath: string): Promise<Uint8Array>;
	function readFile(filePath: string, encoding: BufferEncoding): Promise<string>;
	async function readFile(filePath: string, encoding?: BufferEncoding): Promise<string | Uint8Array> {
		if (encoding !== undefined) {
			return fs.readFile(filePath, encoding);
		}
		return fs.readFile(filePath);
	}

	return {
		exec: (command, options) =>
			exec(command, {
				...options,
				cwd: options?.cwd ? resolveWorkspacePath(options.cwd) : rootdir,
			}),
		resolveWorkspacePath,
		rootdir,
		fs: {
			readFile,
			writeFile: async (filePath, content, encoding) => {
				const resolvedPath = resolveWorkspacePath(filePath);
				if (typeof content === "string") {
					await fs.writeFile(resolvedPath, content, encoding ?? "utf-8");
					return;
				}
				await fs.writeFile(resolvedPath, content);
			},
			mkdir: async (dirPath, options) => {
				await fs.mkdir(resolveWorkspacePath(dirPath), options);
			},
			readdir: async (dirPath) => fs.readdir(resolveWorkspacePath(dirPath)),
			stat: async (statPath) => fs.stat(resolveWorkspacePath(statPath)),
			access: async (accessPath, mode) => fs.access(resolveWorkspacePath(accessPath), mode ?? constants.F_OK),
			exists: async (existsPath) => {
				try {
					await fs.access(resolveWorkspacePath(existsPath), constants.F_OK);
					return true;
				} catch {
					return false;
				}
			},
		},
		path,
		os,
	};
}
