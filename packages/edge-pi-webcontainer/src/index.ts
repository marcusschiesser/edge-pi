import type { EdgePiRuntime, ExecOptions, ExecResult } from "edge-pi";

interface WebContainerLike {
	spawn(
		command: string,
		args?: string[],
		options?: { cwd?: string },
	): Promise<{
		output: ReadableStream<string>;
		exit: Promise<number>;
		kill(): void;
	}>;
	fs: {
		readFile(path: string, encoding?: BufferEncoding): Promise<string | Uint8Array>;
		writeFile(path: string, content: string): Promise<void>;
		mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
		readdir(path: string): Promise<string[]>;
		stat(path: string): Promise<{ isDirectory(): boolean; isFile(): boolean }>;
	};
}

export function createWebContainerRuntime(webcontainer: WebContainerLike): EdgePiRuntime {
	return {
		async exec(command: string, options?: ExecOptions): Promise<ExecResult> {
			const process = await webcontainer.spawn("sh", ["-lc", command], {
				cwd: options?.cwd,
			});
			let output = "";
			const reader = process.output.getReader();
			while (true) {
				const chunk = await reader.read();
				if (chunk.done) break;
				output += chunk.value;
				if (options?.abortSignal?.aborted) {
					process.kill();
					return { output, exitCode: null, truncated: false, timedOut: false, aborted: true };
				}
			}
			const exitCode = await process.exit;
			return { output, exitCode, truncated: false, timedOut: false, aborted: false };
		},
		fs: {
			readFile: async (path, encoding) => {
				const value = await webcontainer.fs.readFile(path, encoding ? encoding : undefined);
				return typeof value === "string" ? value : Buffer.from(value);
			},
			writeFile: async (path, content) => {
				await webcontainer.fs.writeFile(path, content as string);
			},
			mkdir: async (path) => {
				await webcontainer.fs.mkdir(path, { recursive: true });
			},
			readdir: (path) => webcontainer.fs.readdir(path) as Promise<string[]>,
			stat: async (path) => {
				const stat = await webcontainer.fs.stat(path);
				return { isDirectory: () => stat.isDirectory(), isFile: () => stat.isFile() };
			},
			access: async (path) => {
				await webcontainer.fs.stat(path);
			},
			exists: async (path) => {
				try {
					await webcontainer.fs.stat(path);
					return true;
				} catch {
					return false;
				}
			},
		},
		path: {
			join: (...parts) => parts.join("/").replace(/\/+/g, "/"),
			dirname: (p) => p.split("/").slice(0, -1).join("/") || "/",
			relative: (_from, to) => to,
			resolve: (...parts) => parts.join("/").replace(/\/+/g, "/"),
			isAbsolute: (p) => p.startsWith("/"),
			basename: (p) => p.split("/").pop() || p,
		},
		os: {
			homedir: () => "/home/project",
			tmpdir: () => "/tmp",
		},
	};
}
