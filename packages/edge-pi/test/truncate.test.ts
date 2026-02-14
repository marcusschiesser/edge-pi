import { describe, expect, it } from "vitest";
import { utf8ByteLength } from "../src/runtime/encoding.js";
import { formatSize, truncateHead, truncateLine, truncateTail } from "../src/tools/truncate.js";

describe("truncateHead", () => {
	it("returns content unchanged when within limits", () => {
		const content = "line 1\nline 2\nline 3";
		const result = truncateHead(content);

		expect(result.truncated).toBe(false);
		expect(result.content).toBe(content);
		expect(result.truncatedBy).toBeNull();
		expect(result.totalLines).toBe(3);
	});

	it("truncates by line limit", () => {
		const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
		const content = lines.join("\n");

		const result = truncateHead(content, { maxLines: 10 });

		expect(result.truncated).toBe(true);
		expect(result.truncatedBy).toBe("lines");
		expect(result.outputLines).toBe(10);
		expect(result.totalLines).toBe(100);
		expect(result.content).toContain("Line 1");
		expect(result.content).toContain("Line 10");
		expect(result.content).not.toContain("Line 11");
	});

	it("truncates by byte limit", () => {
		const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}: ${"x".repeat(100)}`);
		const content = lines.join("\n");

		const result = truncateHead(content, { maxBytes: 500 });

		expect(result.truncated).toBe(true);
		expect(result.truncatedBy).toBe("bytes");
		expect(result.outputBytes).toBeLessThanOrEqual(500);
	});

	it("handles first line exceeding byte limit", () => {
		const content = "x".repeat(100);

		const result = truncateHead(content, { maxBytes: 50 });

		expect(result.truncated).toBe(true);
		expect(result.firstLineExceedsLimit).toBe(true);
		expect(result.content).toBe("");
		expect(result.outputLines).toBe(0);
	});

	it("handles empty content", () => {
		const result = truncateHead("");

		expect(result.truncated).toBe(false);
		expect(result.content).toBe("");
		expect(result.totalLines).toBe(1); // empty string splits to [""]
	});

	it("line limit takes priority when both would truncate", () => {
		const lines = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}`);
		const content = lines.join("\n");

		// maxLines would cut at 5, maxBytes is generous
		const result = truncateHead(content, { maxLines: 5, maxBytes: 100000 });

		expect(result.truncated).toBe(true);
		expect(result.truncatedBy).toBe("lines");
		expect(result.outputLines).toBe(5);
	});
});

describe("truncateTail", () => {
	it("returns content unchanged when within limits", () => {
		const content = "line 1\nline 2\nline 3";
		const result = truncateTail(content);

		expect(result.truncated).toBe(false);
		expect(result.content).toBe(content);
	});

	it("truncates by line limit, keeping the end", () => {
		const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
		const content = lines.join("\n");

		const result = truncateTail(content, { maxLines: 10 });

		expect(result.truncated).toBe(true);
		expect(result.truncatedBy).toBe("lines");
		expect(result.outputLines).toBe(10);
		expect(result.content).toContain("Line 100");
		expect(result.content).toContain("Line 91");
		expect(result.content).not.toContain("Line 90");
	});

	it("truncates by byte limit, keeping the end", () => {
		const lines = Array.from({ length: 10 }, (_, i) => `Line ${i + 1}: ${"x".repeat(100)}`);
		const content = lines.join("\n");

		const result = truncateTail(content, { maxBytes: 500 });

		expect(result.truncated).toBe(true);
		expect(result.truncatedBy).toBe("bytes");
		expect(result.content).toContain("Line 10:");
	});

	it("handles single long line (partial)", () => {
		const content = "x".repeat(200);

		const result = truncateTail(content, { maxBytes: 100 });

		expect(result.truncated).toBe(true);
		expect(result.lastLinePartial).toBe(true);
		expect(utf8ByteLength(result.content)).toBeLessThanOrEqual(100);
	});
});

describe("truncateLine", () => {
	it("returns line unchanged when within max chars", () => {
		const { text, wasTruncated } = truncateLine("short line");
		expect(text).toBe("short line");
		expect(wasTruncated).toBe(false);
	});

	it("truncates long lines", () => {
		const longLine = "x".repeat(600);
		const { text, wasTruncated } = truncateLine(longLine);
		expect(wasTruncated).toBe(true);
		expect(text).toContain("... [truncated]");
		expect(text.length).toBeLessThan(longLine.length);
	});

	it("respects custom max chars", () => {
		const { text, wasTruncated } = truncateLine("12345678901234567890", 10);
		expect(wasTruncated).toBe(true);
		expect(text).toContain("... [truncated]");
	});
});

describe("formatSize", () => {
	it("formats bytes", () => {
		expect(formatSize(500)).toBe("500B");
	});

	it("formats kilobytes", () => {
		expect(formatSize(2048)).toBe("2.0KB");
	});

	it("formats megabytes", () => {
		expect(formatSize(2 * 1024 * 1024)).toBe("2.0MB");
	});
});
