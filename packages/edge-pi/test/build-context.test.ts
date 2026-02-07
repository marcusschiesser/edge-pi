import type { UserModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import { buildSessionContext } from "../src/session/context.js";
import type { BranchSummaryEntry, CompactionEntry, ModelChangeEntry, SessionEntry } from "../src/session/types.js";
import { msg } from "./utilities.js";

function compaction(id: string, parentId: string | null, summary: string, firstKeptEntryId: string): CompactionEntry {
	return {
		type: "compaction",
		id,
		parentId,
		timestamp: "2025-01-01T00:00:00Z",
		summary,
		firstKeptEntryId,
		tokensBefore: 1000,
	};
}

function branchSummary(id: string, parentId: string | null, summary: string, fromId: string): BranchSummaryEntry {
	return {
		type: "branch_summary",
		id,
		parentId,
		timestamp: "2025-01-01T00:00:00Z",
		summary,
		fromId,
	};
}

function modelChange(id: string, parentId: string | null, provider: string, modelId: string): ModelChangeEntry {
	return {
		type: "model_change",
		id,
		parentId,
		timestamp: "2025-01-01T00:00:00Z",
		provider,
		modelId,
	};
}

describe("buildSessionContext", () => {
	describe("trivial cases", () => {
		it("empty entries returns empty context", () => {
			const ctx = buildSessionContext([]);
			expect(ctx.messages).toEqual([]);
			expect(ctx.model).toBeNull();
		});

		it("single user message", () => {
			const entries: SessionEntry[] = [msg("1", null, "user", "hello")];
			const ctx = buildSessionContext(entries);
			expect(ctx.messages).toHaveLength(1);
			expect(ctx.messages[0].role).toBe("user");
		});

		it("simple conversation", () => {
			const entries: SessionEntry[] = [
				msg("1", null, "user", "hello"),
				msg("2", "1", "assistant", "hi there"),
				msg("3", "2", "user", "how are you"),
				msg("4", "3", "assistant", "great"),
			];
			const ctx = buildSessionContext(entries);
			expect(ctx.messages).toHaveLength(4);
			expect(ctx.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
		});

		it("tracks model from model change entry", () => {
			const entries: SessionEntry[] = [
				msg("1", null, "user", "hello"),
				modelChange("2", "1", "openai", "gpt-4"),
				msg("3", "2", "assistant", "hi"),
			];
			const ctx = buildSessionContext(entries);
			// Model change should be tracked
			expect(ctx.model).toBeDefined();
		});
	});

	describe("with compaction", () => {
		it("includes summary before kept messages", () => {
			const entries: SessionEntry[] = [
				msg("1", null, "user", "first"),
				msg("2", "1", "assistant", "response1"),
				msg("3", "2", "user", "second"),
				msg("4", "3", "assistant", "response2"),
				compaction("5", "4", "Summary of first two turns", "3"),
				msg("6", "5", "user", "third"),
				msg("7", "6", "assistant", "response3"),
			];
			const ctx = buildSessionContext(entries);

			// Should have: summary + kept (3,4) + after (6,7) = 5 messages
			expect(ctx.messages).toHaveLength(5);

			// First message should be the compaction summary
			const summaryMsg = ctx.messages[0] as UserModelMessage;
			expect(summaryMsg.role).toBe("user");
			const summaryText = (summaryMsg.content as any[])[0].text;
			expect(summaryText).toContain("Summary of first two turns");
		});

		it("handles compaction keeping from first message", () => {
			const entries: SessionEntry[] = [
				msg("1", null, "user", "first"),
				msg("2", "1", "assistant", "response"),
				compaction("3", "2", "Empty summary", "1"),
				msg("4", "3", "user", "second"),
			];
			const ctx = buildSessionContext(entries);

			// Summary + all messages (1,2,4)
			expect(ctx.messages).toHaveLength(4);
		});

		it("multiple compactions uses latest", () => {
			const entries: SessionEntry[] = [
				msg("1", null, "user", "a"),
				msg("2", "1", "assistant", "b"),
				compaction("3", "2", "First summary", "1"),
				msg("4", "3", "user", "c"),
				msg("5", "4", "assistant", "d"),
				compaction("6", "5", "Second summary", "4"),
				msg("7", "6", "user", "e"),
			];
			const ctx = buildSessionContext(entries);

			// Should use second summary, keep from 4
			expect(ctx.messages).toHaveLength(4);
			const summaryText = ((ctx.messages[0] as UserModelMessage).content as any[])[0].text;
			expect(summaryText).toContain("Second summary");
		});
	});

	describe("with branches", () => {
		it("follows path to specified leaf", () => {
			const entries: SessionEntry[] = [
				msg("1", null, "user", "start"),
				msg("2", "1", "assistant", "response"),
				msg("3", "2", "user", "branch A"),
				msg("4", "2", "user", "branch B"),
			];

			const ctxA = buildSessionContext(entries, "3");
			expect(ctxA.messages).toHaveLength(3);

			const ctxB = buildSessionContext(entries, "4");
			expect(ctxB.messages).toHaveLength(3);
		});

		it("includes branch summary in path", () => {
			const entries: SessionEntry[] = [
				msg("1", null, "user", "start"),
				msg("2", "1", "assistant", "response"),
				msg("3", "2", "user", "abandoned path"),
				branchSummary("4", "2", "Summary of abandoned work", "3"),
				msg("5", "4", "user", "new direction"),
			];
			const ctx = buildSessionContext(entries, "5");

			expect(ctx.messages).toHaveLength(4);
			// Branch summary should be in there
			const hasSummary = ctx.messages.some((m) => {
				if (m.role !== "user") return false;
				const content = (m as UserModelMessage).content;
				if (!Array.isArray(content)) return false;
				return content.some((c: any) => c.text?.includes("Summary of abandoned work"));
			});
			expect(hasSummary).toBe(true);
		});
	});

	describe("edge cases", () => {
		it("uses last entry when leafId not found", () => {
			const entries: SessionEntry[] = [msg("1", null, "user", "hello"), msg("2", "1", "assistant", "hi")];
			const ctx = buildSessionContext(entries, "nonexistent");
			expect(ctx.messages).toHaveLength(2);
		});

		it("handles orphaned entries gracefully", () => {
			const entries: SessionEntry[] = [msg("1", null, "user", "hello"), msg("2", "missing", "assistant", "orphan")];
			const ctx = buildSessionContext(entries, "2");
			// Should only get the orphan since parent chain is broken
			expect(ctx.messages).toHaveLength(1);
		});

		it("returns empty when leafId is null", () => {
			const entries: SessionEntry[] = [msg("1", null, "user", "hello")];
			const ctx = buildSessionContext(entries, null);
			expect(ctx.messages).toEqual([]);
		});
	});
});
