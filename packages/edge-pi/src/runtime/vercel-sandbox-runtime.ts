import { constants as fsConstants } from "node:fs";
import type { Sandbox } from "@vercel/sandbox";
import type { EdgePiRuntime, ExecOptions, ExecResult } from "./types.js";

function createPathHelpers() {
	const normalize = (value: string): string => value.replace(/\\/g, "/").replace(/\/+/g, "/");
	const join = (...parts: string[]): string => normalize(parts.filter(Boolean).join("/"));

	return {
		join,
		dirname: (targetPath: string) => {
			const normalized = normalize(targetPath);
			const pieces = normalized.split("/").filter((piece) => piece.length > 0);
			if (pieces.length <= 1) {
				return normalized.startsWith("/") ? "/" : ".";
			}
			const prefix = normalized.startsWith("/") ? "/" : "";
			return `${prefix}${pieces.slice(0, -1).join("/")}`;
		},
		relative: (from: string, to: string) => {
			const fromParts = normalize(from).split("/").filter(Boolean);
			const toParts = normalize(to).split("/").filter(Boolean);
			let index = 0;
			while (index < fromParts.length && index < toParts.length && fromParts[index] === toParts[index]) {
				index += 1;
			}
			const back = new Array(fromParts.length - index).fill("..");
			const next = toParts.slice(index);
			const value = [...back, ...next].join("/");
			return value.length > 0 ? value : ".";
		},
		resolve: (...parts: string[]) => {
			const normalized = normalize(parts.join("/"));
			const absolute = normalized.startsWith("/");
			const stack: string[] = [];
			for (const part of normalized.split("/")) {
				if (!part || part === ".") continue;
				if (part === "..") {
					stack.pop();
					continue;
				}
				stack.push(part);
			}
			const result = `${absolute ? "/" : ""}${stack.join("/")}`;
			return result || (absolute ? "/" : ".");
		},
		isAbsolute: (targetPath: string) => normalize(targetPath).startsWith("/"),
		basename: (targetPath: string) => {
			const normalized = normalize(targetPath).replace(/\/$/, "");
			const parts = normalized.split("/");
			return parts[parts.length - 1] || normalized;
		},
	};
}

function createAbortController(options?: ExecOptions): {
	signal: AbortSignal;
	cleanup: () => void;
	hasTimedOut: () => boolean;
} {
	const controller = new AbortController();
	let timedOut = false;
	let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

	const onAbort = () => {
		controller.abort();
	};

	if (options?.abortSignal) {
		if (options.abortSignal.aborted) {
			controller.abort();
		} else {
			options.abortSignal.addEventListener("abort", onAbort, { once: true });
		}
	}

	if (options?.timeoutSeconds && options.timeoutSeconds > 0) {
		timeoutHandle = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, options.timeoutSeconds * 1000);
	}

	return {
		signal: controller.signal,
		cleanup: () => {
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}
			options?.abortSignal?.removeEventListener("abort", onAbort);
		},
		hasTimedOut: () => timedOut,
	};
}

function shellFlagForMode(mode: number): string[] {
	const flags = ["-e"];
	if (mode & fsConstants.R_OK) flags.push("-r");
	if (mode & fsConstants.W_OK) flags.push("-w");
	if (mode & fsConstants.X_OK) flags.push("-x");
	return flags;
}

export function createVercelSandboxRuntime(sandbox: Sandbox): EdgePiRuntime {
	const pathHelpers = createPathHelpers();
	const homeDir = "/vercel/sandbox";

	const resolveFsPath = (targetPath: string): string =>
		targetPath.startsWith("/") ? targetPath : pathHelpers.resolve(homeDir, targetPath);

	const runTest = async (flag: string, targetPath: string): Promise<boolean> => {
		const result = await sandbox.runCommand({
			cmd: "test",
			args: [flag, targetPath],
		});
		return result.exitCode === 0;
	};

	function readFile(targetPath: string): Promise<Uint8Array>;
	function readFile(targetPath: string, encoding: BufferEncoding): Promise<string>;
	async function readFile(targetPath: string, encoding?: BufferEncoding): Promise<string | Uint8Array> {
		const resolvedPath = resolveFsPath(targetPath);
		const data = await sandbox.readFileToBuffer({ path: resolvedPath });
		if (!data) {
			throw new Error(`No such file or directory: ${resolvedPath}`);
		}
		if (encoding !== undefined) {
			return data.toString(encoding);
		}
		return new Uint8Array(data);
	}

	return {
		exec: async (command: string, options?: ExecOptions): Promise<ExecResult> => {
			const { signal, cleanup, hasTimedOut } = createAbortController(options);
			try {
				const result = await sandbox.runCommand({
					cmd: "bash",
					args: ["-lc", command],
					cwd: options?.cwd,
					signal,
				});

				const output = await result.output("both", { signal });
				return {
					output,
					exitCode: result.exitCode,
					truncated: false,
					timedOut: hasTimedOut(),
					aborted: options?.abortSignal?.aborted ?? false,
				};
			} catch (error) {
				const timedOut = hasTimedOut();
				const aborted = timedOut || options?.abortSignal?.aborted === true;
				if (aborted) {
					return {
						output: "",
						exitCode: null,
						truncated: false,
						timedOut,
						aborted: true,
					};
				}
				throw error;
			} finally {
				cleanup();
			}
		},
		fs: {
			readFile,
			writeFile: async (targetPath: string, content: string | Uint8Array, encoding?: BufferEncoding) => {
				const resolvedPath = resolveFsPath(targetPath);
				const data = typeof content === "string" ? Buffer.from(content, encoding ?? "utf-8") : Buffer.from(content);
				await sandbox.writeFiles([{ path: resolvedPath, content: data }]);
			},
			mkdir: async (targetPath: string, options?: { recursive?: boolean }) => {
				const resolvedPath = resolveFsPath(targetPath);
				if (options?.recursive) {
					await sandbox.runCommand({
						cmd: "mkdir",
						args: ["-p", resolvedPath],
					});
					return;
				}
				await sandbox.mkDir(resolvedPath);
			},
			readdir: async (targetPath: string) => {
				const resolvedPath = resolveFsPath(targetPath);
				const result = await sandbox.runCommand({
					cmd: "ls",
					args: ["-A1", resolvedPath],
				});
				if (result.exitCode !== 0) {
					throw new Error(`Unable to read directory: ${resolvedPath}`);
				}
				const output = await result.stdout();
				if (!output.trim()) return [];
				return output
					.split("\n")
					.map((line) => line.trim())
					.filter((line) => line.length > 0);
			},
			stat: async (targetPath: string) => {
				const resolvedPath = resolveFsPath(targetPath);
				if (await runTest("-d", resolvedPath)) {
					return {
						isDirectory: () => true,
						isFile: () => false,
					};
				}
				if (await runTest("-f", resolvedPath)) {
					return {
						isDirectory: () => false,
						isFile: () => true,
					};
				}
				throw new Error(`No such file or directory: ${resolvedPath}`);
			},
			access: async (targetPath: string, mode?: number) => {
				const resolvedPath = resolveFsPath(targetPath);
				const flags = shellFlagForMode(mode ?? fsConstants.F_OK);
				for (const flag of flags) {
					const accessible = await runTest(flag, resolvedPath);
					if (!accessible) {
						throw new Error(`Access denied: ${resolvedPath}`);
					}
				}
			},
			exists: async (targetPath: string) => {
				const resolvedPath = resolveFsPath(targetPath);
				return runTest("-e", resolvedPath);
			},
		},
		path: pathHelpers,
		os: {
			homedir: () => homeDir,
			tmpdir: () => "/tmp",
		},
	};
}
