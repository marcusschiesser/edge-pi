import { createPosixPathHelpers } from "./posix-path-helpers.js";
import type { EdgePiFs, EdgePiRuntime } from "./types.js";
import { createWorkspacePathResolver } from "./workspace-path-resolver.js";

export interface MemoryRuntimeOptions {
	rootdir?: string;
	initialFiles?: Record<string, string>;
}

function createMemoryFs(rootdir: string, initialFiles: Record<string, string>): { fs: EdgePiFs } {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	const files = new Map<string, Uint8Array>();
	const dirs = new Set<string>(["/"]);

	const ensureParentDirs = (absPath: string) => {
		const path = createPosixPathHelpers();
		let dir = path.dirname(absPath);
		while (dir !== "/" && dir !== ".") {
			dirs.add(dir);
			dir = path.dirname(dir);
		}
	};

	dirs.add(rootdir);
	for (const [relPath, content] of Object.entries(initialFiles)) {
		const absPath = createPosixPathHelpers().join(rootdir, relPath);
		files.set(absPath, encoder.encode(content));
		ensureParentDirs(absPath);
	}

	function readFile(path: string): Promise<Uint8Array>;
	function readFile(path: string, encoding: BufferEncoding): Promise<string>;
	async function readFile(path: string, encoding?: BufferEncoding): Promise<string | Uint8Array> {
		const data = files.get(path);
		if (!data) {
			throw Object.assign(new Error(`ENOENT: no such file or directory: ${path}`), { code: "ENOENT" });
		}
		return encoding ? decoder.decode(data) : data;
	}

	const fs: EdgePiFs = {
		readFile: readFile as EdgePiFs["readFile"],
		writeFile: async (path, content) => {
			const data = typeof content === "string" ? encoder.encode(content) : new Uint8Array(content);
			files.set(path, data);
			ensureParentDirs(path);
		},
		mkdir: async (path, options) => {
			if (!options?.recursive) {
				const parent = createPosixPathHelpers().dirname(path);
				if (!dirs.has(parent)) {
					throw Object.assign(new Error(`ENOENT: no such file or directory: ${parent}`), {
						code: "ENOENT",
					});
				}
			} else {
				const posix = createPosixPathHelpers();
				let dir = path;
				const toAdd: string[] = [];
				while (dir !== "/" && dir !== ".") {
					toAdd.push(dir);
					dir = posix.dirname(dir);
				}
				for (const d of toAdd) dirs.add(d);
			}
			dirs.add(path);
		},
		readdir: async (path) => {
			if (!dirs.has(path)) {
				throw Object.assign(new Error(`ENOENT: no such file or directory: ${path}`), { code: "ENOENT" });
			}
			const prefix = path.endsWith("/") ? path : `${path}/`;
			const entries = new Set<string>();
			for (const p of files.keys()) {
				if (p.startsWith(prefix)) {
					const part = p.slice(prefix.length).split("/")[0];
					if (part) entries.add(part);
				}
			}
			for (const d of dirs) {
				if (d !== path && d.startsWith(prefix)) {
					const rest = d.slice(prefix.length);
					if (rest && !rest.includes("/")) entries.add(rest);
				}
			}
			return [...entries].sort();
		},
		stat: async (path) => {
			const isDir = dirs.has(path);
			const isFile = files.has(path);
			if (!isDir && !isFile) {
				throw Object.assign(new Error(`ENOENT: no such file or directory: ${path}`), { code: "ENOENT" });
			}
			return {
				isDirectory: () => isDir && !isFile,
				isFile: () => isFile,
			};
		},
		access: async (path) => {
			if (!dirs.has(path) && !files.has(path)) {
				throw Object.assign(new Error(`ENOENT: no such file or directory: ${path}`), { code: "ENOENT" });
			}
		},
		exists: async (path) => dirs.has(path) || files.has(path),
	};

	return { fs };
}

/**
 * Creates an in-memory runtime with a virtual filesystem and no exec support.
 *
 * Useful for:
 * - Testing agents without touching the real filesystem
 * - Sandboxed environments where exec is not allowed
 * - Browser contexts where shell access is unavailable
 *
 * With the default `"coding"` toolset, the agent gets `read`, `edit`, and
 * `write` — bash is automatically excluded because exec is absent.
 */
export function createMemoryRuntime(options: MemoryRuntimeOptions = {}): EdgePiRuntime {
	const rootdir = options.rootdir ?? "/workspace";
	const { fs } = createMemoryFs(rootdir, options.initialFiles ?? {});
	const posixPath = createPosixPathHelpers();

	return {
		rootdir,
		resolveWorkspacePath: createWorkspacePathResolver({
			rootdir,
			resolvePath: posixPath.resolve,
		}),
		fs,
		path: posixPath,
		os: { tmpdir: () => "/tmp" },
	};
}
