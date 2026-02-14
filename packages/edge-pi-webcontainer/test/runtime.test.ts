import { describe, expect, it } from "vitest";
import { createWebContainerRuntime } from "../src/index.js";

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
				readFile: async () => "",
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
				readFile: async () => "",
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
});
