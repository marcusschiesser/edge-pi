import type {
	WebContainer,
	BufferEncoding as WebContainerBufferEncoding,
	WebContainerProcess,
} from "@webcontainer/api";
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

export function createWebContainerRuntime(webcontainer: WebContainer): EdgePiRuntime {
	const pathHelpers = createPathHelpers();
	const homeDir = "/home/project";
	const resolveFsPath = (targetPath: string): string =>
		targetPath.startsWith("/") ? targetPath : pathHelpers.resolve(homeDir, targetPath);
	const normalizeEncoding = (encoding: BufferEncoding): WebContainerBufferEncoding =>
		encoding === "utf-16le" ? "utf16le" : (encoding as WebContainerBufferEncoding);

	const stat = async (targetPath: string): Promise<{ isDirectory(): boolean; isFile(): boolean }> => {
		const resolvedPath = resolveFsPath(targetPath);
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
		const resolvedPath = resolveFsPath(targetPath);
		if (encoding !== undefined) {
			return webcontainer.fs.readFile(resolvedPath, normalizeEncoding(encoding));
		}
		return webcontainer.fs.readFile(resolvedPath);
	}

	return {
		exec: async (command: string, options?: ExecOptions): Promise<ExecResult> => {
			const process = await webcontainer.spawn("sh", ["-lc", command], {
				cwd: options?.cwd,
			});
			return readProcessOutput(process, options);
		},
		fs: {
			readFile,
			writeFile: async (targetPath: string, content: string | Uint8Array) => {
				const resolvedPath = resolveFsPath(targetPath);
				if (typeof content === "string") {
					await webcontainer.fs.writeFile(resolvedPath, content);
					return;
				}
				await webcontainer.fs.writeFile(resolvedPath, new Uint8Array(content));
			},
			mkdir: async (targetPath: string, options?: { recursive?: boolean }) => {
				const resolvedPath = resolveFsPath(targetPath);
				if (options?.recursive) {
					await webcontainer.fs.mkdir(resolvedPath, { recursive: true });
					return;
				}
				await webcontainer.fs.mkdir(resolvedPath);
			},
			readdir: async (targetPath: string) => webcontainer.fs.readdir(resolveFsPath(targetPath)),
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
			homedir: () => homeDir,
			tmpdir: () => "/tmp",
		},
	};
}
