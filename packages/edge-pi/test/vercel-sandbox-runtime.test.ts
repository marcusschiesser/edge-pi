import type { Sandbox } from "@vercel/sandbox";
import { describe, expect, it } from "vitest";
import { createVercelSandboxRuntime } from "../src/runtime/vercel-sandbox-runtime.js";

interface MockCommandResult {
	exitCode: number;
	output(stream?: "stdout" | "stderr" | "both"): Promise<string>;
	stdout(): Promise<string>;
}

function createCommandResult(stdoutValue: string, stderrValue = "", exitCode = 0): MockCommandResult {
	return {
		exitCode,
		output: async (stream = "both") => {
			if (stream === "stdout") return stdoutValue;
			if (stream === "stderr") return stderrValue;
			return `${stdoutValue}${stderrValue}`;
		},
		stdout: async () => stdoutValue,
	};
}

function createSandbox(overrides?: {
	runCommand?: (params: {
		cmd: string;
		args?: string[];
		cwd?: string;
		signal?: AbortSignal;
	}) => Promise<MockCommandResult>;
	readFileToBuffer?: (params: { path: string; cwd?: string }) => Promise<Buffer | null>;
}): Sandbox {
	const runCommand =
		overrides?.runCommand ??
		(async () => {
			return createCommandResult("");
		});
	const readFileToBuffer = overrides?.readFileToBuffer ?? (async () => Buffer.from(""));

	return {
		runCommand,
		readFileToBuffer,
		writeFiles: async () => undefined,
		mkDir: async () => undefined,
	} as unknown as Sandbox;
}

describe("createVercelSandboxRuntime", () => {
	it("exec returns combined output and exit code", async () => {
		const runtime = createVercelSandboxRuntime(
			createSandbox({
				runCommand: async ({ cmd, args }) => {
					expect(cmd).toBe("bash");
					expect(args).toEqual(["-lc", "echo hi"]);
					return createCommandResult("hello", " world", 0);
				},
			}),
		);

		const result = await runtime.exec("echo hi");
		expect(result.output).toBe("hello world");
		expect(result.exitCode).toBe(0);
		expect(result.aborted).toBe(false);
		expect(result.timedOut).toBe(false);
	});

	it("fs.exists returns false for missing paths", async () => {
		const runtime = createVercelSandboxRuntime(
			createSandbox({
				runCommand: async ({ cmd, args }) => {
					if (cmd === "test" && args?.[0] === "-e" && args[1] === "/missing") {
						return createCommandResult("", "", 1);
					}
					return createCommandResult("");
				},
			}),
		);

		expect(await runtime.fs.exists("/missing")).toBe(false);
	});

	it("resolves relative fs paths against runtime rootdir", async () => {
		let readPath = "";
		const runtime = createVercelSandboxRuntime(
			createSandbox({
				readFileToBuffer: async ({ path }) => {
					readPath = path;
					return Buffer.from("hello");
				},
			}),
		);

		await runtime.fs.readFile("README.md", "utf-8");
		expect(runtime.rootdir).toBe("/vercel/sandbox");
		expect(readPath).toBe("/vercel/sandbox/README.md");
	});
});
