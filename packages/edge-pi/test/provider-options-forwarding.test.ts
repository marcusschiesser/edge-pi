import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateTextMock } = vi.hoisted(() => ({
	generateTextMock: vi.fn(async (_params: unknown) => ({ text: "summary" })),
}));

vi.mock("ai", async () => {
	const actual = await vi.importActual<typeof import("ai")>("ai");
	return {
		...actual,
		generateText: generateTextMock,
	};
});

import { generateBranchSummary } from "../src/compaction/branch-summarization.js";
import type { CompactionPreparation } from "../src/compaction/compaction.js";
import { compact } from "../src/compaction/compaction.js";
import type { SessionEntry } from "../src/session/types.js";

describe("provider options forwarding", () => {
	beforeEach(() => {
		generateTextMock.mockClear();
	});

	it("forwards providerOptions to compaction summarize call", async () => {
		const providerOptions = {
			openai: {
				instructions: "Follow all system and developer messages for task and tool behavior.",
				store: false,
			},
		};

		const preparation: CompactionPreparation = {
			firstKeptEntryId: "id-2",
			messagesToSummarize: [{ role: "user", content: [{ type: "text", text: "summarize this" }] }],
			turnPrefixMessages: [],
			isSplitTurn: false,
			tokensBefore: 1000,
			fileOps: { read: new Set(), edited: new Set(), written: new Set() },
			settings: { enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 },
		};

		await compact(preparation, {} as never, providerOptions);

		expect(generateTextMock).toHaveBeenCalledTimes(1);
		const firstCall = generateTextMock.mock.calls.at(0);
		expect(firstCall).toBeDefined();
		expect(firstCall?.[0]).toMatchObject({ providerOptions });
	});

	it("forwards providerOptions to branch summarization call", async () => {
		const providerOptions = {
			openai: {
				instructions: "Follow all system and developer messages for task and tool behavior.",
				store: false,
			},
		};

		const entries: SessionEntry[] = [
			{
				type: "message",
				id: "id-1",
				parentId: null,
				timestamp: new Date().toISOString(),
				message: {
					role: "user",
					content: [{ type: "text", text: "work on this branch" }],
				},
			},
		];

		await generateBranchSummary(entries, {
			model: {} as never,
			signal: new AbortController().signal,
			providerOptions,
		});

		expect(generateTextMock).toHaveBeenCalledTimes(1);
		const firstCall = generateTextMock.mock.calls.at(0);
		expect(firstCall).toBeDefined();
		expect(firstCall?.[0]).toMatchObject({ providerOptions });
	});
});
