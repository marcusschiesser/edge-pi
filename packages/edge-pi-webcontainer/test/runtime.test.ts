import { describe, expect, it } from "vitest";
import { createWebContainerRuntime } from "../src/index.js";

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

describe("createWebContainerRuntime", () => {
	it("exec returns combined output and exit code", async () => {
		const runtime = createWebContainerRuntime({
			spawn: async () => ({
				output: streamFrom(["hello", " world"]),
				exit: Promise.resolve(0),
				kill: () => undefined,
			}),
			fs: {
				readFile: mockReadFile,
				writeFile: async () => undefined,
				mkdir: async () => undefined,
				readdir: async () => [],
				stat: async () => ({ isDirectory: () => false, isFile: () => true }),
			},
		});

		const result = await runtime.exec("echo hi");
		expect(result.output).toBe("hello world");
		expect(result.exitCode).toBe(0);
		expect(result.aborted).toBe(false);
	});

	it("fs.exists returns false for missing paths", async () => {
		const runtime = createWebContainerRuntime({
			spawn: async () => ({
				output: streamFrom([]),
				exit: Promise.resolve(0),
				kill: () => undefined,
			}),
			fs: {
				readFile: mockReadFile,
				writeFile: async () => undefined,
				mkdir: async () => undefined,
				readdir: async () => [],
				stat: async () => {
					throw new Error("missing");
				},
			},
		});

		expect(await runtime.fs.exists("/missing")).toBe(false);
	});

	it("resolves relative fs paths against runtime homedir", async () => {
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
			spawn: async () => ({
				output: streamFrom([]),
				exit: Promise.resolve(0),
				kill: () => undefined,
			}),
			fs: {
				readFile: captureReadFile,
				writeFile: async () => undefined,
				mkdir: async () => undefined,
				readdir: async () => [],
				stat: async () => ({ isDirectory: () => false, isFile: () => true }),
			},
		});

		await runtime.fs.readFile("App.jsx", "utf-8");
		expect(readPath).toBe("/home/project/App.jsx");
	});
});
