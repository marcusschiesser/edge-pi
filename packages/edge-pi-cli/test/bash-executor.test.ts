import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { executeBashCommand, formatSize, truncateTail } from "../src/utils/bash-executor.js";

// Track temp files created during tests so we can clean up
const tempFiles: string[] = [];

afterEach(() => {
	for (const f of tempFiles) {
		try {
			unlinkSync(f);
		} catch {
			// ignore
		}
	}
	tempFiles.length = 0;
});

describe("formatSize", () => {
	it("should format bytes", () => {
		expect(formatSize(0)).toBe("0B");
		expect(formatSize(500)).toBe("500B");
		expect(formatSize(1023)).toBe("1023B");
	});

	it("should format kilobytes", () => {
		expect(formatSize(1024)).toBe("1.0KB");
		expect(formatSize(2048)).toBe("2.0KB");
		expect(formatSize(1536)).toBe("1.5KB");
	});

	it("should format megabytes", () => {
		expect(formatSize(1024 * 1024)).toBe("1.0MB");
		expect(formatSize(1024 * 1024 * 2.5)).toBe("2.5MB");
	});
});

describe("truncateTail", () => {
	it("should return content unchanged when under limits", () => {
		const result = truncateTail("hello\nworld", { maxLines: 10, maxBytes: 1000 });
		expect(result.content).toBe("hello\nworld");
		expect(result.truncated).toBe(false);
		expect(result.truncatedBy).toBeNull();
		expect(result.totalLines).toBe(2);
	});

	it("should truncate by lines keeping the tail", () => {
		const content = "line1\nline2\nline3\nline4\nline5";
		const result = truncateTail(content, { maxLines: 3, maxBytes: 100000 });
		expect(result.truncated).toBe(true);
		expect(result.truncatedBy).toBe("lines");
		expect(result.content).toBe("line3\nline4\nline5");
		expect(result.outputLines).toBe(3);
		expect(result.totalLines).toBe(5);
	});

	it("should truncate by bytes keeping the tail", () => {
		// Each line is ~6 bytes + newline
		const content = "aaaaaa\nbbbbbb\ncccccc\ndddddd";
		const result = truncateTail(content, { maxLines: 100, maxBytes: 15 });
		expect(result.truncated).toBe(true);
		expect(result.truncatedBy).toBe("bytes");
		// Should keep only what fits within 15 bytes from the tail
		expect(result.content).toContain("dddddd");
	});

	it("should handle empty content", () => {
		const result = truncateTail("", { maxLines: 10, maxBytes: 1000 });
		expect(result.content).toBe("");
		expect(result.truncated).toBe(false);
		expect(result.totalLines).toBe(1); // empty string splits to [""]
	});

	it("should handle single line content", () => {
		const result = truncateTail("hello", { maxLines: 1, maxBytes: 1000 });
		expect(result.content).toBe("hello");
		expect(result.truncated).toBe(false);
	});

	it("should use defaults when no options provided", () => {
		const result = truncateTail("hello");
		expect(result.content).toBe("hello");
		expect(result.truncated).toBe(false);
	});
});

describe("executeBashCommand", () => {
	it("should run a simple command and capture stdout", async () => {
		const result = await executeBashCommand("echo hello");
		expect(result.output).toBe("hello\n");
		expect(result.exitCode).toBe(0);
		expect(result.cancelled).toBe(false);
		expect(result.truncated).toBe(false);
	});

	it("should capture stderr", async () => {
		const result = await executeBashCommand("echo error >&2");
		expect(result.output).toContain("error");
		expect(result.exitCode).toBe(0);
	});

	it("should report non-zero exit codes", async () => {
		const result = await executeBashCommand("exit 42");
		expect(result.exitCode).toBe(42);
		expect(result.cancelled).toBe(false);
	});

	it("should run in the specified cwd", async () => {
		const result = await executeBashCommand("pwd", { cwd: "/tmp" });
		// /tmp may resolve to /private/tmp on macOS
		expect(result.output.trim()).toMatch(/^(\/tmp|\/private\/tmp)$/);
		expect(result.exitCode).toBe(0);
	});

	it("should call onChunk for each output chunk", async () => {
		const chunks: string[] = [];
		const result = await executeBashCommand("echo line1; echo line2", {
			onChunk: (chunk) => chunks.push(chunk),
		});

		expect(result.output).toContain("line1");
		expect(result.output).toContain("line2");
		expect(chunks.length).toBeGreaterThanOrEqual(1);
		expect(chunks.join("")).toContain("line1");
		expect(chunks.join("")).toContain("line2");
	});

	it("should cancel a running command via AbortController", async () => {
		const controller = new AbortController();

		// Start a long-running command, then abort after a short delay
		const resultPromise = executeBashCommand("sleep 30", {
			signal: controller.signal,
		});

		// Give it a moment to start, then abort
		await new Promise((r) => setTimeout(r, 100));
		controller.abort();

		const result = await resultPromise;
		expect(result.cancelled).toBe(true);
	});

	it("should handle already-aborted signal", async () => {
		const controller = new AbortController();
		controller.abort();

		const result = await executeBashCommand("echo should-not-run", {
			signal: controller.signal,
		});

		expect(result.cancelled).toBe(true);
	});

	it("should truncate output when exceeding maxLines", async () => {
		// Generate 20 lines but limit to 5
		const result = await executeBashCommand("for i in $(seq 1 20); do echo line$i; done", {
			maxLines: 5,
			maxBytes: 1024 * 1024,
		});

		expect(result.truncated).toBe(true);
		// truncateTail keeps the tail, so we should see the last lines
		expect(result.output).toContain("line20");
		expect(result.output).toContain("Showing lines");
		if (result.fullOutputPath) tempFiles.push(result.fullOutputPath);
	});

	it("should truncate output when exceeding maxBytes", async () => {
		// Generate output larger than 200 bytes but limit to 200
		const result = await executeBashCommand(
			"for i in $(seq 1 100); do echo 'this is a longer line of text for testing truncation'; done",
			{
				maxBytes: 200,
				maxLines: 100000,
			},
		);

		expect(result.truncated).toBe(true);
		expect(result.output).toContain("Showing lines");
		if (result.fullOutputPath) tempFiles.push(result.fullOutputPath);
	});

	it("should write full output to a temp file when output exceeds maxBytes", async () => {
		// Generate enough data that the chunks exceed maxBytes threshold during streaming
		// Use dd to produce a large block of data that will arrive in multiple chunks
		const result = await executeBashCommand("dd if=/dev/zero bs=1024 count=64 2>/dev/null | base64", {
			maxBytes: 512,
			maxLines: 100000,
		});

		expect(result.truncated).toBe(true);
		expect(result.fullOutputPath).toBeDefined();
		expect(existsSync(result.fullOutputPath!)).toBe(true);

		const fullContent = readFileSync(result.fullOutputPath!, "utf-8");
		expect(fullContent.length).toBeGreaterThan(512);

		tempFiles.push(result.fullOutputPath!);
	});

	it("should not truncate small output", async () => {
		const result = await executeBashCommand("echo small");
		expect(result.truncated).toBe(false);
		expect(result.fullOutputPath).toBeUndefined();
	});

	it("should handle commands with no output", async () => {
		const result = await executeBashCommand("true");
		expect(result.output).toBe("");
		expect(result.exitCode).toBe(0);
		expect(result.cancelled).toBe(false);
	});

	it("should handle multi-line output", async () => {
		const result = await executeBashCommand("echo a; echo b; echo c");
		expect(result.output.trim().split("\n")).toEqual(["a", "b", "c"]);
	});

	it("should not include 'Command cancelled' text in cancelled output", async () => {
		const controller = new AbortController();

		const resultPromise = executeBashCommand("echo before-cancel; sleep 30", {
			signal: controller.signal,
		});

		await new Promise((r) => setTimeout(r, 100));
		controller.abort();

		const result = await resultPromise;
		expect(result.cancelled).toBe(true);
		// The "Command cancelled" text was removed — the component handles this via setComplete()
		expect(result.output).not.toContain("Command cancelled");
	});
});
