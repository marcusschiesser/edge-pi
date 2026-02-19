import type { WebContainer, WebContainerProcess } from "@webcontainer/api";
import { describe, expect, it } from "vitest";
import { createWebContainerRuntime } from "../src/runtime/webcontainer-runtime.js";

function mockReadFile(_path: string): Promise<Uint8Array>;
function mockReadFile(_path: string, _encoding: BufferEncoding): Promise<string>;
function mockReadFile(_path?: string, encoding?: BufferEncoding): Promise<string | Uint8Array> {
	if (encoding !== undefined) {
		return Promise.resolve("");
	}
	return Promise.resolve(new Uint8Array());
}

function streamFrom(chunks: string[]): ReadableStream<string> {
	return new ReadableStream<string>({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(chunk);
			}
			controller.close();
		},
	});
}

function createProcess(chunks: string[], exitCode = 0): WebContainerProcess {
	return {
		output: streamFrom(chunks),
		exit: Promise.resolve(exitCode),
		input: new WritableStream<string>(),
		kill: () => undefined,
		resize: () => undefined,
	};
}

describe("createWebContainerRuntime", () => {
	it("exec returns combined output and exit code", async () => {
		const runtime = createWebContainerRuntime({
			spawn: async () => createProcess(["hello", " world"]),
			fs: {
				readFile: mockReadFile,
				writeFile: async () => undefined,
				mkdir: async () => undefined,
				readdir: async () => [],
			},
		} as unknown as WebContainer);

		const result = await runtime.exec("echo hi");
		expect(result.output).toBe("hello world");
		expect(result.exitCode).toBe(0);
		expect(result.aborted).toBe(false);
	});

	it("fs.exists returns false for missing paths", async () => {
		const runtime = createWebContainerRuntime({
			spawn: async () => createProcess([]),
			fs: {
				readFile: async () => {
					throw new Error("missing");
				},
				writeFile: async () => undefined,
				mkdir: async () => undefined,
				readdir: async () => {
					throw new Error("missing");
				},
			},
		} as unknown as WebContainer);

		expect(await runtime.fs.exists("/missing")).toBe(false);
	});

	it("resolves relative fs paths against runtime rootdir", async () => {
		let readPath = "";
		function captureReadFile(path: string): Promise<Uint8Array>;
		function captureReadFile(path: string, _encoding: BufferEncoding): Promise<string>;
		async function captureReadFile(path: string, encoding?: BufferEncoding): Promise<string | Uint8Array> {
			readPath = path;
			if (encoding !== undefined) {
				return "";
			}
			return new Uint8Array();
		}

		const runtime = createWebContainerRuntime({
			spawn: async () => createProcess([]),
			fs: {
				readFile: captureReadFile,
				writeFile: async () => undefined,
				mkdir: async () => undefined,
				readdir: async () => [],
			},
		} as unknown as WebContainer);

		await runtime.fs.readFile("App.jsx", "utf-8");
		expect(runtime.rootdir).toBe("/home/project");
		expect(readPath).toBe("/home/project/App.jsx");
	});

	it("normalizes pseudo-absolute home/project paths", async () => {
		let readPath = "";
		function captureReadFile(path: string): Promise<Uint8Array>;
		function captureReadFile(path: string, _encoding: BufferEncoding): Promise<string>;
		async function captureReadFile(path: string, encoding?: BufferEncoding): Promise<string | Uint8Array> {
			readPath = path;
			if (encoding !== undefined) {
				return "";
			}
			return new Uint8Array();
		}

		const runtime = createWebContainerRuntime({
			spawn: async () => createProcess([]),
			fs: {
				readFile: captureReadFile,
				writeFile: async () => undefined,
				mkdir: async () => undefined,
				readdir: async () => [],
			},
		} as unknown as WebContainer);

		await runtime.fs.readFile("home/project/app.jsx", "utf-8");
		expect(readPath).toBe("/home/project/app.jsx");
	});

	it("collapses duplicated absolute home prefixes", async () => {
		let readPath = "";
		function captureReadFile(path: string): Promise<Uint8Array>;
		function captureReadFile(path: string, _encoding: BufferEncoding): Promise<string>;
		async function captureReadFile(path: string, encoding?: BufferEncoding): Promise<string | Uint8Array> {
			readPath = path;
			if (encoding !== undefined) {
				return "";
			}
			return new Uint8Array();
		}

		const runtime = createWebContainerRuntime({
			spawn: async () => createProcess([]),
			fs: {
				readFile: captureReadFile,
				writeFile: async () => undefined,
				mkdir: async () => undefined,
				readdir: async () => [],
			},
		} as unknown as WebContainer);

		await runtime.fs.readFile("/home/id/home/project/app.jsx", "utf-8");
		expect(readPath).toBe("/home/project/app.jsx");
	});

	it("resolves exec cwd relative to rootdir", async () => {
		let spawnCwd = "";
		const runtime = createWebContainerRuntime({
			spawn: async (_cmd: string, _args: string[], options?: { cwd?: string }) => {
				spawnCwd = options?.cwd ?? "";
				return createProcess([]);
			},
			fs: {
				readFile: mockReadFile,
				writeFile: async () => undefined,
				mkdir: async () => undefined,
				readdir: async () => [],
			},
		} as unknown as WebContainer);

		await runtime.exec("echo hi", { cwd: "src" });
		expect(spawnCwd).toBe("/home/project/src");
	});
});
