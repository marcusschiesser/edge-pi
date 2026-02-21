import type {
	WebContainer,
	BufferEncoding as WebContainerBufferEncoding,
	WebContainerProcess,
} from "@webcontainer/api";
import { createPosixPathHelpers } from "./posix-path-helpers.js";
import type { EdgePiRuntime, ExecOptions, ExecResult } from "./types.js";
import { createWorkspacePathResolver } from "./workspace-path-resolver.js";

export interface WebContainerRuntimeOptions {
	rootdir?: string;
}

async function readProcessOutput(process: WebContainerProcess, options?: ExecOptions): Promise<ExecResult> {
	const reader = process.output.getReader();
	let output = "";
	let aborted = false;
	let timedOut = false;

	let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
	if (options?.timeoutSeconds && options.timeoutSeconds > 0) {
		timeoutHandle = setTimeout(() => {
			timedOut = true;
			process.kill();
		}, options.timeoutSeconds * 1000);
	}

	const onAbort = () => {
		aborted = true;
		process.kill();
	};
	if (options?.abortSignal) {
		if (options.abortSignal.aborted) onAbort();
		else options.abortSignal.addEventListener("abort", onAbort, { once: true });
	}

	while (true) {
		const chunk = await reader.read();
		if (chunk.done) break;
		output += chunk.value;
	}

	const exitCode = aborted || timedOut ? null : await process.exit;

	if (timeoutHandle) clearTimeout(timeoutHandle);
	options?.abortSignal?.removeEventListener("abort", onAbort);

	return {
		output,
		exitCode,
		truncated: false,
		timedOut,
		aborted,
	};
}

export function createWebContainerRuntime(
	webcontainer: WebContainer,
	options: WebContainerRuntimeOptions = {},
): EdgePiRuntime {
	const pathHelpers = createPosixPathHelpers();
	const rootdir = options.rootdir ?? "/home/project";
	const resolveWorkspacePath = createWorkspacePathResolver({
		rootdir,
		resolvePath: (...parts: string[]) => pathHelpers.resolve(...parts),
	});
	const normalizeEncoding = (encoding: BufferEncoding): WebContainerBufferEncoding =>
		encoding === "utf-16le" ? "utf16le" : (encoding as WebContainerBufferEncoding);
	let ensureRootdirPromise: Promise<void> | null = null;
	const ensureRootdir = async (): Promise<void> => {
		if (ensureRootdirPromise === null) {
			ensureRootdirPromise = webcontainer.fs.mkdir(rootdir, { recursive: true }).then(() => undefined);
		}
		await ensureRootdirPromise;
	};

	const stat = async (targetPath: string): Promise<{ isDirectory(): boolean; isFile(): boolean }> => {
		await ensureRootdir();
		const resolvedPath = resolveWorkspacePath(targetPath);
		try {
			await webcontainer.fs.readdir(resolvedPath);
			return {
				isDirectory: () => true,
				isFile: () => false,
			};
		} catch {
			await webcontainer.fs.readFile(resolvedPath);
			return {
				isDirectory: () => false,
				isFile: () => true,
			};
		}
	};

	function readFile(targetPath: string): Promise<Uint8Array>;
	function readFile(targetPath: string, encoding: BufferEncoding): Promise<string>;
	async function readFile(targetPath: string, encoding?: BufferEncoding): Promise<string | Uint8Array> {
		await ensureRootdir();
		const resolvedPath = resolveWorkspacePath(targetPath);
		if (encoding !== undefined) {
			return webcontainer.fs.readFile(resolvedPath, normalizeEncoding(encoding));
		}
		return webcontainer.fs.readFile(resolvedPath);
	}

	return {
		resolveWorkspacePath,
		rootdir,
		exec: async (command: string, options?: ExecOptions): Promise<ExecResult> => {
			await ensureRootdir();
			const process = await webcontainer.spawn("sh", ["-lc", command], {
				cwd: options?.cwd ? resolveWorkspacePath(options.cwd) : rootdir,
			});
			return readProcessOutput(process, options);
		},
		fs: {
			readFile,
			writeFile: async (targetPath: string, content: string | Uint8Array) => {
				await ensureRootdir();
				const resolvedPath = resolveWorkspacePath(targetPath);
				if (typeof content === "string") {
					await webcontainer.fs.writeFile(resolvedPath, content);
					return;
				}
				await webcontainer.fs.writeFile(resolvedPath, new Uint8Array(content));
			},
			mkdir: async (targetPath: string, options?: { recursive?: boolean }) => {
				await ensureRootdir();
				const resolvedPath = resolveWorkspacePath(targetPath);
				if (options?.recursive) {
					await webcontainer.fs.mkdir(resolvedPath, { recursive: true });
					return;
				}
				await webcontainer.fs.mkdir(resolvedPath);
			},
			readdir: async (targetPath: string) => {
				await ensureRootdir();
				return webcontainer.fs.readdir(resolveWorkspacePath(targetPath));
			},
			stat,
			access: async (targetPath: string) => {
				await stat(targetPath);
			},
			exists: async (targetPath: string) => {
				try {
					await stat(targetPath);
					return true;
				} catch {
					return false;
				}
			},
		},
		path: pathHelpers,
		os: {
			tmpdir: () => "/tmp",
		},
	};
}
