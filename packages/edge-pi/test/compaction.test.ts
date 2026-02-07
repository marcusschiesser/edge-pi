import type { ModelMessage } from "ai";
import { beforeEach, describe, expect, it } from "vitest";
import { findCutPoint, prepareCompaction } from "../src/compaction/compaction.js";
import { estimateContextTokens, estimateTokens, shouldCompact } from "../src/compaction/token-estimation.js";
import type { MessageEntry, SessionEntry } from "../src/session/types.js";
import { assistantMsg, createCompactionEntry, createMessageEntry, resetEntryCounter, userMsg } from "./utilities.js";

beforeEach(() => {
	resetEntryCounter();
});

// ============================================================================
// Token estimation
// ============================================================================

describe("estimateTokens", () => {
	it("estimates user text message", () => {
		const tokens = estimateTokens(userMsg("hello world")); // 11 chars -> ceil(11/4) = 3
		expect(tokens).toBe(3);
	});

	it("estimates assistant text message", () => {
		const tokens = estimateTokens(assistantMsg("this is a response")); // 18 chars -> 5
		expect(tokens).toBe(5);
	});

	it("estimates tool result message", () => {
		const msg: ModelMessage = {
			role: "tool",
			content: [
				{
					type: "tool-result",
					toolCallId: "tc1",
					toolName: "read",
					output: "x".repeat(400) as any, // 400 chars -> 100
				},
			],
		};
		expect(estimateTokens(msg)).toBe(100);
	});

	it("estimates assistant message with tool call", () => {
		const msg: ModelMessage = {
			role: "assistant",
			content: [
				{
					type: "tool-call",
					toolCallId: "tc1",
					toolName: "read",
					input: { path: "/some/file.txt" },
				},
			],
		};
		const tokens = estimateTokens(msg);
		expect(tokens).toBeGreaterThan(0);
	});

	it("estimates system message", () => {
		const msg: ModelMessage = {
			role: "system",
			content: "You are a helpful assistant.",
		};
		const tokens = estimateTokens(msg);
		expect(tokens).toBe(Math.ceil(28 / 4));
	});

	it("returns 0 for empty message", () => {
		const msg: ModelMessage = {
			role: "user",
			content: [],
		};
		expect(estimateTokens(msg)).toBe(0);
	});
});

describe("estimateContextTokens", () => {
	it("sums tokens for multiple messages", () => {
		const messages: ModelMessage[] = [
			userMsg("hello"), // ceil(5/4) = 2
			assistantMsg("world"), // ceil(5/4) = 2
		];
		expect(estimateContextTokens(messages)).toBe(4);
	});

	it("returns 0 for empty array", () => {
		expect(estimateContextTokens([])).toBe(0);
	});
});

describe("shouldCompact", () => {
	it("returns true when context exceeds threshold", () => {
		const settings = { enabled: true, reserveTokens: 10000 };
		expect(shouldCompact(95000, 100000, settings)).toBe(true);
		expect(shouldCompact(89000, 100000, settings)).toBe(false);
	});

	it("returns false when disabled", () => {
		const settings = { enabled: false, reserveTokens: 10000 };
		expect(shouldCompact(95000, 100000, settings)).toBe(false);
	});

	it("returns false when within budget", () => {
		const settings = { enabled: true, reserveTokens: 10000 };
		expect(shouldCompact(50000, 100000, settings)).toBe(false);
	});
});

// ============================================================================
// Cut point detection
// ============================================================================

describe("findCutPoint", () => {
	it("finds cut point based on token budget", () => {
		const entries: SessionEntry[] = [];
		for (let i = 0; i < 10; i++) {
			entries.push(createMessageEntry(userMsg(`User ${i} ${"x".repeat(100)}`)));
			entries.push(createMessageEntry(assistantMsg(`Assistant ${i} ${"x".repeat(100)}`)));
		}

		const result = findCutPoint(entries, 0, entries.length, 500);

		expect(entries[result.firstKeptEntryIndex].type).toBe("message");
		const role = (entries[result.firstKeptEntryIndex] as MessageEntry).message.role;
		expect(role === "user" || role === "assistant").toBe(true);
	});

	it("returns startIndex if only one entry", () => {
		const entries: SessionEntry[] = [createMessageEntry(assistantMsg("a"))];
		const result = findCutPoint(entries, 0, entries.length, 1000);
		expect(result.firstKeptEntryIndex).toBe(0);
	});

	it("keeps everything if all messages fit within budget", () => {
		const entries: SessionEntry[] = [
			createMessageEntry(userMsg("1")),
			createMessageEntry(assistantMsg("a")),
			createMessageEntry(userMsg("2")),
			createMessageEntry(assistantMsg("b")),
		];

		const result = findCutPoint(entries, 0, entries.length, 50000);
		expect(result.firstKeptEntryIndex).toBe(0);
	});
});

// ============================================================================
// Compaction preparation
// ============================================================================

describe("prepareCompaction", () => {
	it("returns undefined when last entry is compaction", () => {
		const entries: SessionEntry[] = [
			createMessageEntry(userMsg("1")),
			createMessageEntry(assistantMsg("a")),
			createCompactionEntry("summary", "test-id-0"),
		];

		const result = prepareCompaction(entries, {
			enabled: true,
			reserveTokens: 16384,
			keepRecentTokens: 20000,
		});

		expect(result).toBeUndefined();
	});

	it("returns preparation for a session needing compaction", () => {
		const entries: SessionEntry[] = [];
		// Create enough entries to need compaction
		for (let i = 0; i < 20; i++) {
			entries.push(createMessageEntry(userMsg(`User message ${i} ${"x".repeat(200)}`)));
			entries.push(createMessageEntry(assistantMsg(`Response ${i} ${"x".repeat(200)}`)));
		}

		const result = prepareCompaction(entries, {
			enabled: true,
			reserveTokens: 16384,
			keepRecentTokens: 500,
		});

		expect(result).toBeDefined();
		expect(result!.messagesToSummarize.length).toBeGreaterThan(0);
		expect(result!.firstKeptEntryId).toBeTruthy();
		expect(result!.tokensBefore).toBeGreaterThan(0);
	});

	it("returns undefined for empty entries", () => {
		const result = prepareCompaction([], {
			enabled: true,
			reserveTokens: 16384,
			keepRecentTokens: 20000,
		});

		expect(result).toBeUndefined();
	});
});
