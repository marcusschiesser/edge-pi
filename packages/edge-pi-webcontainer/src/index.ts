import type { WebContainer, WebContainerProcess } from "@webcontainer/api";
import type { EdgePiRuntime, ExecOptions, ExecResult } from "edge-pi";

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
	return {
		exec: async (command: string, options?: ExecOptions): Promise<ExecResult> => {
			const process = await webcontainer.spawn("sh", ["-lc", command], {
				cwd: options?.cwd,
			});
			return readProcessOutput(process, options);
		},
		fs: {
			readFile: async (targetPath: string, encoding?: BufferEncoding) => {
				const value = await webcontainer.fs.readFile(targetPath, encoding);
				return typeof value === "string" ? value : new Uint8Array(value);
			},
			writeFile: async (targetPath: string, content: string | Uint8Array) => {
				if (typeof content === "string") {
					await webcontainer.fs.writeFile(targetPath, content);
					return;
				}
				await webcontainer.fs.writeFile(targetPath, new Uint8Array(content));
			},
			mkdir: async (targetPath: string, options?: { recursive?: boolean }) => {
				await webcontainer.fs.mkdir(targetPath, { recursive: options?.recursive ?? true });
			},
			readdir: async (targetPath: string) => webcontainer.fs.readdir(targetPath),
			stat: async (targetPath: string) => webcontainer.fs.stat(targetPath),
			access: async (targetPath: string) => {
				await webcontainer.fs.stat(targetPath);
			},
			exists: async (targetPath: string) => {
				try {
					await webcontainer.fs.stat(targetPath);
					return true;
				} catch {
					return false;
				}
			},
		},
		path: createPathHelpers(),
		os: {
			homedir: () => "/home/project",
			tmpdir: () => "/tmp",
		},
	};
}
