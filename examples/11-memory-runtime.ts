/**
 * Memory Runtime Example
 *
 * Demonstrates running CodingAgent with a virtual in-memory filesystem and
 * no exec capability. The agent can read, search, and write files entirely
 * in memory — no disk access, no shell commands.
 *
 * The memory runtime is useful for:
 *   - Testing agents without touching the real filesystem
 *   - Sandboxed environments where exec is not allowed
 *   - Browser contexts where shell access is unavailable
 */

import { posix as posixPath } from "node:path";
import { anthropic } from "@ai-sdk/anthropic";
import { stepCountIs } from "ai";
import { CodingAgent, type EdgePiFs, type EdgePiOs, type EdgePiPath, type EdgePiRuntime } from "edge-pi";
import { printStream } from "./utils.js";

// ---------------------------------------------------------------------------
// In-memory filesystem
// ---------------------------------------------------------------------------

function createMemoryFs(initialFiles: Record<string, string> = {}): {
	fs: EdgePiFs;
	dirs: Set<string>;
	files: Map<string, Uint8Array>;
} {
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	const files = new Map<string, Uint8Array>();
	const dirs = new Set<string>(["/", "/workspace"]);

	const ensureParentDirs = (absPath: string) => {
		let dir = posixPath.dirname(absPath);
		while (dir !== "/" && dir !== ".") {
			dirs.add(dir);
			dir = posixPath.dirname(dir);
		}
	};

	// Seed initial files under /workspace
	for (const [relPath, content] of Object.entries(initialFiles)) {
		const absPath = posixPath.join("/workspace", relPath);
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
				const parent = posixPath.dirname(path);
				if (!dirs.has(parent)) {
					throw Object.assign(new Error(`ENOENT: no such file or directory: ${parent}`), { code: "ENOENT" });
				}
			} else {
				let dir = path;
				const toAdd: string[] = [];
				while (dir !== "/" && dir !== ".") {
					toAdd.push(dir);
					dir = posixPath.dirname(dir);
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
					const rest = p.slice(prefix.length);
					const part = rest.split("/")[0];
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

	return { fs, dirs, files };
}

// ---------------------------------------------------------------------------
// Null runtime factory
// ---------------------------------------------------------------------------

function createMemoryRuntime(initialFiles: Record<string, string> = {}): EdgePiRuntime {
	const rootdir = "/workspace";
	const { fs } = createMemoryFs(initialFiles);

	const resolveWorkspacePath = (targetPath: string, options?: { cwd?: string }): string => {
		const normalized = targetPath.replace(/\\/g, "/");
		if (normalized === "~" || normalized === "~/") return rootdir;
		if (normalized.startsWith("~/")) return posixPath.join(rootdir, normalized.slice(2));
		if (posixPath.isAbsolute(normalized)) return posixPath.normalize(normalized);
		return posixPath.resolve(options?.cwd ?? rootdir, normalized);
	};

	const path: EdgePiPath = {
		join: posixPath.join,
		dirname: posixPath.dirname,
		relative: posixPath.relative,
		resolve: posixPath.resolve,
		isAbsolute: posixPath.isAbsolute,
		basename: posixPath.basename,
	};

	const os: EdgePiOs = {
		tmpdir: () => "/tmp",
	};

	return {
		rootdir,
		resolveWorkspacePath,
		fs,
		path,
		os,
	};
}

// ---------------------------------------------------------------------------
// Example
// ---------------------------------------------------------------------------

// Seed the virtual filesystem with a small project
const runtime = createMemoryRuntime({
	"README.md": `# Virtual Project

A simple project living entirely in memory.

## Modules

- **math.ts** — arithmetic utilities
- **string.ts** — string helpers
- **index.ts** — re-exports everything
`,
	"src/math.ts": `export const add = (a: number, b: number) => a + b;
export const subtract = (a: number, b: number) => a - b;
export const multiply = (a: number, b: number) => a * b;
export const divide = (a: number, b: number) => {
  if (b === 0) throw new Error("Division by zero");
  return a / b;
};
`,
	"src/string.ts": `export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const truncate = (s: string, max: number) => (s.length > max ? \`\${s.slice(0, max)}...\` : s);
export const words = (s: string) => s.trim().split(/\\s+/);
`,
	"src/index.ts": `export * from "./math.js";
export * from "./string.js";
`,
	"src/math.test.ts": `import { add, subtract, multiply, divide } from "./math.js";

test("add", () => expect(add(1, 2)).toBe(3));
test("subtract", () => expect(subtract(5, 3)).toBe(2));
test("multiply", () => expect(multiply(3, 4)).toBe(12));
test("divide", () => expect(divide(10, 2)).toBe(5));
test("divide by zero", () => expect(() => divide(1, 0)).toThrow());
`,
});

const agent = new CodingAgent({
	model: anthropic("claude-sonnet-4-5-20250929"),
	runtime,
	stopWhen: stepCountIs(8),
});

console.log("Running agent against memory runtime (no exec)...\n");

const result = await agent.stream({
	prompt:
		"Explore this project and give me a brief overview: what files exist, what each module exports, and whether the test file covers all exported functions from math.ts.",
});

await printStream(result);
