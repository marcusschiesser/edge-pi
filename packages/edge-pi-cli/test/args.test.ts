import { describe, expect, it } from "vitest";
import { parseArgs } from "../src/cli/args.js";

describe("parseArgs", () => {
	it("should return default empty args", () => {
		const result = parseArgs([]);
		expect(result.messages).toHaveLength(0);
		expect(result.fileArgs).toHaveLength(0);
		expect(result.help).toBeUndefined();
		expect(result.version).toBeUndefined();
		expect(result.provider).toBeUndefined();
	});

	it("should parse --help and -h", () => {
		expect(parseArgs(["--help"]).help).toBe(true);
		expect(parseArgs(["-h"]).help).toBe(true);
	});

	it("should parse --version and -v", () => {
		expect(parseArgs(["--version"]).version).toBe(true);
		expect(parseArgs(["-v"]).version).toBe(true);
	});

	it("should parse --provider", () => {
		const result = parseArgs(["--provider", "anthropic"]);
		expect(result.provider).toBe("anthropic");
	});

	it("should parse --model", () => {
		const result = parseArgs(["--model", "claude-sonnet-4-20250514"]);
		expect(result.model).toBe("claude-sonnet-4-20250514");
	});

	it("should parse --api-key", () => {
		const result = parseArgs(["--api-key", "sk-test-123"]);
		expect(result.apiKey).toBe("sk-test-123");
	});

	it("should parse --system-prompt", () => {
		const result = parseArgs(["--system-prompt", "You are a helpful assistant"]);
		expect(result.systemPrompt).toBe("You are a helpful assistant");
	});

	it("should parse --append-system-prompt", () => {
		const result = parseArgs(["--append-system-prompt", "Extra instructions"]);
		expect(result.appendSystemPrompt).toBe("Extra instructions");
	});

	it("should parse --print and -p", () => {
		expect(parseArgs(["--print"]).print).toBe(true);
		expect(parseArgs(["-p"]).print).toBe(true);
	});

	it("should parse --continue and -c", () => {
		expect(parseArgs(["--continue"]).continue).toBe(true);
		expect(parseArgs(["-c"]).continue).toBe(true);
	});

	it("should parse --no-session", () => {
		expect(parseArgs(["--no-session"]).noSession).toBe(true);
	});

	it("should parse --session", () => {
		const result = parseArgs(["--session", "/path/to/session.jsonl"]);
		expect(result.session).toBe("/path/to/session.jsonl");
	});

	it("should parse --session-dir", () => {
		const result = parseArgs(["--session-dir", "/path/to/sessions"]);
		expect(result.sessionDir).toBe("/path/to/sessions");
	});

	it("should parse --tools with valid values", () => {
		expect(parseArgs(["--tools", "coding"]).toolSet).toBe("coding");
		expect(parseArgs(["--tools", "readonly"]).toolSet).toBe("readonly");
		expect(parseArgs(["--tools", "all"]).toolSet).toBe("all");
	});

	it("should not set toolSet for invalid tool values", () => {
		expect(parseArgs(["--tools", "invalid"]).toolSet).toBeUndefined();
	});

	it("should parse --thinking with valid levels", () => {
		expect(parseArgs(["--thinking", "off"]).thinking).toBe("off");
		expect(parseArgs(["--thinking", "minimal"]).thinking).toBe("minimal");
		expect(parseArgs(["--thinking", "low"]).thinking).toBe("low");
		expect(parseArgs(["--thinking", "medium"]).thinking).toBe("medium");
		expect(parseArgs(["--thinking", "high"]).thinking).toBe("high");
	});

	it("should not set thinking for invalid levels", () => {
		expect(parseArgs(["--thinking", "max"]).thinking).toBeUndefined();
	});

	it("should parse --skill (repeatable)", () => {
		const result = parseArgs(["--skill", "path/one", "--skill", "path/two"]);
		expect(result.skills).toEqual(["path/one", "path/two"]);
	});

	it("should parse --no-skills", () => {
		expect(parseArgs(["--no-skills"]).noSkills).toBe(true);
	});

	it("should parse --max-steps with valid number", () => {
		expect(parseArgs(["--max-steps", "100"]).maxSteps).toBe(100);
	});

	it("should not set maxSteps for invalid values", () => {
		expect(parseArgs(["--max-steps", "abc"]).maxSteps).toBeUndefined();
		expect(parseArgs(["--max-steps", "0"]).maxSteps).toBeUndefined();
		expect(parseArgs(["--max-steps", "-5"]).maxSteps).toBeUndefined();
	});

	it("should parse --verbose", () => {
		expect(parseArgs(["--verbose"]).verbose).toBe(true);
	});

	it("should parse --mode", () => {
		expect(parseArgs(["--mode", "text"]).mode).toBe("text");
		expect(parseArgs(["--mode", "json"]).mode).toBe("json");
		expect(parseArgs(["--mode", "invalid"]).mode).toBeUndefined();
	});

	it("should collect positional arguments as messages", () => {
		const result = parseArgs(["hello", "world"]);
		expect(result.messages).toEqual(["hello", "world"]);
	});

	it("should collect @file arguments", () => {
		const result = parseArgs(["@readme.md", "@notes.txt"]);
		expect(result.fileArgs).toEqual(["readme.md", "notes.txt"]);
	});

	it("should handle mixed arguments correctly", () => {
		const result = parseArgs([
			"--provider",
			"anthropic",
			"--model",
			"claude-sonnet-4-20250514",
			"-p",
			"@prompt.md",
			"Hello world",
		]);

		expect(result.provider).toBe("anthropic");
		expect(result.model).toBe("claude-sonnet-4-20250514");
		expect(result.print).toBe(true);
		expect(result.fileArgs).toEqual(["prompt.md"]);
		expect(result.messages).toEqual(["Hello world"]);
	});

	it("should ignore unknown flags starting with -", () => {
		const result = parseArgs(["--unknown-flag", "value", "message"]);
		expect(result.messages).toEqual(["value", "message"]);
	});
});
