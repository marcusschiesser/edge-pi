import { describe, expect, it } from "vitest";
import {
	detectLineEnding,
	fuzzyFindText,
	generateDiffString,
	normalizeForFuzzyMatch,
	normalizeToLF,
	restoreLineEndings,
	stripBom,
} from "../src/tools/edit-diff.js";

describe("detectLineEnding", () => {
	it("detects CRLF", () => {
		expect(detectLineEnding("first\r\nsecond\r\n")).toBe("\r\n");
	});

	it("detects LF", () => {
		expect(detectLineEnding("first\nsecond\n")).toBe("\n");
	});

	it("defaults to LF when no newlines", () => {
		expect(detectLineEnding("no newlines")).toBe("\n");
	});

	it("detects CRLF even with mixed endings (first CRLF wins)", () => {
		expect(detectLineEnding("a\r\nb\nc")).toBe("\r\n");
	});
});

describe("normalizeToLF", () => {
	it("converts CRLF to LF", () => {
		expect(normalizeToLF("a\r\nb\r\nc")).toBe("a\nb\nc");
	});

	it("converts lone CR to LF", () => {
		expect(normalizeToLF("a\rb\rc")).toBe("a\nb\nc");
	});

	it("preserves existing LF", () => {
		expect(normalizeToLF("a\nb\nc")).toBe("a\nb\nc");
	});
});

describe("restoreLineEndings", () => {
	it("converts LF to CRLF when ending is CRLF", () => {
		expect(restoreLineEndings("a\nb\nc", "\r\n")).toBe("a\r\nb\r\nc");
	});

	it("preserves LF when ending is LF", () => {
		expect(restoreLineEndings("a\nb\nc", "\n")).toBe("a\nb\nc");
	});
});

describe("normalizeForFuzzyMatch", () => {
	it("strips trailing whitespace per line", () => {
		expect(normalizeForFuzzyMatch("hello   \nworld  ")).toBe("hello\nworld");
	});

	it("normalizes smart single quotes", () => {
		expect(normalizeForFuzzyMatch("\u2018hello\u2019")).toBe("'hello'");
	});

	it("normalizes smart double quotes", () => {
		expect(normalizeForFuzzyMatch("\u201Chello\u201D")).toBe('"hello"');
	});

	it("normalizes Unicode dashes to ASCII hyphen", () => {
		expect(normalizeForFuzzyMatch("range: 1\u20135")).toBe("range: 1-5");
		expect(normalizeForFuzzyMatch("break\u2014here")).toBe("break-here");
	});

	it("normalizes non-breaking spaces", () => {
		expect(normalizeForFuzzyMatch("hello\u00A0world")).toBe("hello world");
	});
});

describe("fuzzyFindText", () => {
	it("finds exact match", () => {
		const result = fuzzyFindText("hello world", "world");
		expect(result.found).toBe(true);
		expect(result.usedFuzzyMatch).toBe(false);
		expect(result.index).toBe(6);
		expect(result.matchLength).toBe(5);
	});

	it("finds fuzzy match with trailing whitespace", () => {
		const result = fuzzyFindText("hello   \nworld  ", "hello\nworld");
		expect(result.found).toBe(true);
		expect(result.usedFuzzyMatch).toBe(true);
	});

	it("finds fuzzy match with smart quotes", () => {
		const result = fuzzyFindText("it\u2019s here", "it's here");
		expect(result.found).toBe(true);
		expect(result.usedFuzzyMatch).toBe(true);
	});

	it("returns not found when no match", () => {
		const result = fuzzyFindText("hello world", "completely different");
		expect(result.found).toBe(false);
		expect(result.index).toBe(-1);
	});

	it("prefers exact match over fuzzy", () => {
		const result = fuzzyFindText("const x = 'exact';", "const x = 'exact';");
		expect(result.found).toBe(true);
		expect(result.usedFuzzyMatch).toBe(false);
	});
});

describe("stripBom", () => {
	it("strips BOM when present", () => {
		const result = stripBom("\uFEFFhello");
		expect(result.bom).toBe("\uFEFF");
		expect(result.text).toBe("hello");
	});

	it("returns empty bom when not present", () => {
		const result = stripBom("hello");
		expect(result.bom).toBe("");
		expect(result.text).toBe("hello");
	});
});

describe("generateDiffString", () => {
	it("generates diff for simple replacement", () => {
		const { diff, firstChangedLine } = generateDiffString("line 1\nline 2\nline 3", "line 1\nline CHANGED\nline 3");

		expect(diff).toContain("-");
		expect(diff).toContain("+");
		expect(diff).toContain("line 2");
		expect(diff).toContain("line CHANGED");
		expect(firstChangedLine).toBe(2);
	});

	it("generates diff for addition", () => {
		const { diff, firstChangedLine } = generateDiffString("line 1\nline 2", "line 1\nnew line\nline 2");

		expect(diff).toContain("+");
		expect(diff).toContain("new line");
		expect(firstChangedLine).toBeDefined();
	});

	it("generates diff for deletion", () => {
		const { diff } = generateDiffString("line 1\nline 2\nline 3", "line 1\nline 3");

		expect(diff).toContain("-");
		expect(diff).toContain("line 2");
	});

	it("returns undefined firstChangedLine for identical content", () => {
		const { diff, firstChangedLine } = generateDiffString("same content", "same content");

		expect(diff).toBe("");
		expect(firstChangedLine).toBeUndefined();
	});
});
