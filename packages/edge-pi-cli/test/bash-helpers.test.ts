import { describe, expect, it } from "vitest";
import {
	formatBashFooter,
	formatPendingMessages,
	parseBashInput,
	truncateDisplayLines,
} from "../src/modes/interactive/bash-helpers.js";

describe("parseBashInput", () => {
	it("should parse single-bang command", () => {
		const result = parseBashInput("!ls -la");
		expect(result).toEqual({ command: "ls -la", excludeFromContext: false });
	});

	it("should parse double-bang command as excluded from context", () => {
		const result = parseBashInput("!!pwd");
		expect(result).toEqual({ command: "pwd", excludeFromContext: true });
	});

	it("should trim whitespace from command", () => {
		expect(parseBashInput("!  echo hello  ")).toEqual({ command: "echo hello", excludeFromContext: false });
		expect(parseBashInput("!!  echo hello  ")).toEqual({ command: "echo hello", excludeFromContext: true });
	});

	it("should return null for non-bash input", () => {
		expect(parseBashInput("hello")).toBeNull();
		expect(parseBashInput("/help")).toBeNull();
		expect(parseBashInput("")).toBeNull();
	});

	it("should return null for bare ! with no command", () => {
		expect(parseBashInput("!")).toBeNull();
		expect(parseBashInput("!  ")).toBeNull();
	});

	it("should return null for bare !! with no command", () => {
		expect(parseBashInput("!!")).toBeNull();
		expect(parseBashInput("!!  ")).toBeNull();
	});

	it("should handle commands with special characters", () => {
		const result = parseBashInput("!echo 'hello world' | grep hello");
		expect(result).toEqual({ command: "echo 'hello world' | grep hello", excludeFromContext: false });
	});

	it("should handle triple bang as double-bang with ! in the command", () => {
		const result = parseBashInput("!!!foo");
		expect(result).toEqual({ command: "!foo", excludeFromContext: true });
	});
});

describe("formatBashFooter", () => {
	it("should return [cancelled] for cancelled commands", () => {
		expect(formatBashFooter(undefined, true, false)).toBe("[cancelled]");
	});

	it("should return [exit N] for non-zero exit codes", () => {
		expect(formatBashFooter(1, false, false)).toBe("[exit 1]");
		expect(formatBashFooter(127, false, false)).toBe("[exit 127]");
	});

	it("should return [exit 0] for successful commands", () => {
		expect(formatBashFooter(0, false, false)).toBe("[exit 0]");
	});

	it("should return empty string when exit code is undefined and not cancelled", () => {
		expect(formatBashFooter(undefined, false, false)).toBe("");
	});

	it("should append truncation info when truncated with path", () => {
		const result = formatBashFooter(0, false, true, "/tmp/output.log");
		expect(result).toContain("[exit 0]");
		expect(result).toContain("truncated");
		expect(result).toContain("/tmp/output.log");
	});

	it("should not append truncation info when truncated but no path", () => {
		const result = formatBashFooter(0, false, true);
		expect(result).toBe("[exit 0]");
	});

	it("should combine cancelled and truncation info", () => {
		const result = formatBashFooter(undefined, true, true, "/tmp/output.log");
		expect(result).toContain("[cancelled]");
		expect(result).toContain("truncated");
	});
});

describe("truncateDisplayLines", () => {
	it("should return empty for empty output", () => {
		expect(truncateDisplayLines("", false)).toEqual({ display: "", hiddenCount: 0 });
		expect(truncateDisplayLines("  \n\n  ", false)).toEqual({ display: "", hiddenCount: 0 });
	});

	it("should return all lines when under limit", () => {
		const output = "line1\nline2\nline3";
		const result = truncateDisplayLines(output, false);
		expect(result.display).toBe("line1\nline2\nline3");
		expect(result.hiddenCount).toBe(0);
	});

	it("should truncate at 12 lines by default", () => {
		const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join("\n");
		const result = truncateDisplayLines(lines, false);
		expect(result.display).toBe(Array.from({ length: 12 }, (_, i) => `line${i + 1}`).join("\n"));
		expect(result.hiddenCount).toBe(8);
	});

	it("should show all lines when expanded", () => {
		const lines = Array.from({ length: 20 }, (_, i) => `line${i + 1}`).join("\n");
		const result = truncateDisplayLines(lines, true);
		expect(result.display).toBe(lines);
		expect(result.hiddenCount).toBe(0);
	});

	it("should support custom maxCollapsedLines", () => {
		const lines = "a\nb\nc\nd\ne";
		const result = truncateDisplayLines(lines, false, 3);
		expect(result.display).toBe("a\nb\nc");
		expect(result.hiddenCount).toBe(2);
	});

	it("should handle exactly maxCollapsedLines", () => {
		const lines = Array.from({ length: 12 }, (_, i) => `line${i + 1}`).join("\n");
		const result = truncateDisplayLines(lines, false);
		expect(result.hiddenCount).toBe(0);
		expect(result.display).toBe(lines);
	});

	it("should trim trailing whitespace before processing", () => {
		const result = truncateDisplayLines("hello\nworld\n\n\n", false);
		expect(result.display).toBe("hello\nworld");
		expect(result.hiddenCount).toBe(0);
	});
});

describe("formatPendingMessages", () => {
	it("should return empty array when no messages", () => {
		expect(formatPendingMessages([], [])).toEqual([]);
	});

	it("should format steering messages", () => {
		const result = formatPendingMessages(["fix the bug", "also refactor"], []);
		expect(result).toEqual(["Steering: fix the bug", "Steering: also refactor"]);
	});

	it("should format follow-up messages", () => {
		const result = formatPendingMessages([], ["then run tests"]);
		expect(result).toEqual(["Follow-up: then run tests"]);
	});

	it("should put steering before follow-up messages", () => {
		const result = formatPendingMessages(["steer1"], ["followup1"]);
		expect(result).toEqual(["Steering: steer1", "Follow-up: followup1"]);
	});

	it("should handle multiple of both types", () => {
		const result = formatPendingMessages(["s1", "s2"], ["f1", "f2"]);
		expect(result).toHaveLength(4);
		expect(result[0]).toBe("Steering: s1");
		expect(result[1]).toBe("Steering: s2");
		expect(result[2]).toBe("Follow-up: f1");
		expect(result[3]).toBe("Follow-up: f2");
	});
});
