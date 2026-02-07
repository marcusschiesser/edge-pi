/**
 * Build session context from entries.
 * Produces ModelMessage[] for the LLM by walking the tree from root to leaf.
 */

import type { ModelMessage, UserModelMessage } from "ai";
import type { CompactionEntry, SessionEntry } from "./types.js";

export interface SessionContext {
	messages: ModelMessage[];
	model: { provider: string; modelId: string } | null;
}

/**
 * Build the session context from entries using tree traversal.
 * If leafId is provided, walks from that entry to root.
 * Handles compaction and branch summaries along the path.
 */
export function buildSessionContext(
	entries: SessionEntry[],
	leafId?: string | null,
	byId?: Map<string, SessionEntry>,
): SessionContext {
	// Build uuid index if not provided
	if (!byId) {
		byId = new Map<string, SessionEntry>();
		for (const entry of entries) {
			byId.set(entry.id, entry);
		}
	}

	// Find leaf
	let leaf: SessionEntry | undefined;
	if (leafId === null) {
		return { messages: [], model: null };
	}
	if (leafId) {
		leaf = byId.get(leafId);
	}
	if (!leaf) {
		leaf = entries[entries.length - 1];
	}
	if (!leaf) {
		return { messages: [], model: null };
	}

	// Walk from leaf to root, collecting path
	const path: SessionEntry[] = [];
	let current: SessionEntry | undefined = leaf;
	while (current) {
		path.unshift(current);
		current = current.parentId ? byId.get(current.parentId) : undefined;
	}

	// Extract model info and find compaction
	let model: { provider: string; modelId: string } | null = null;
	let compaction: CompactionEntry | null = null;

	for (const entry of path) {
		if (entry.type === "model_change") {
			model = { provider: entry.provider, modelId: entry.modelId };
		} else if (entry.type === "compaction") {
			compaction = entry;
		}
	}

	// Build messages
	const messages: ModelMessage[] = [];

	const appendMessage = (entry: SessionEntry) => {
		if (entry.type === "message") {
			messages.push(entry.message);
		} else if (entry.type === "branch_summary" && entry.summary) {
			const summaryMsg: UserModelMessage = {
				role: "user",
				content: [{ type: "text", text: `<summary type="branch">\n${entry.summary}\n</summary>` }],
			};
			messages.push(summaryMsg);
		}
	};

	if (compaction) {
		// Emit compaction summary as a user message
		const summaryMsg: UserModelMessage = {
			role: "user",
			content: [
				{
					type: "text",
					text: `<summary type="compaction" tokens_before="${compaction.tokensBefore}">\n${compaction.summary}\n</summary>`,
				},
			],
		};
		messages.push(summaryMsg);

		// Find compaction index in path
		const compactionIdx = path.findIndex((e) => e.type === "compaction" && e.id === compaction!.id);

		// Emit kept messages (before compaction, starting from firstKeptEntryId)
		let foundFirstKept = false;
		for (let i = 0; i < compactionIdx; i++) {
			const entry = path[i];
			if (entry.id === compaction.firstKeptEntryId) {
				foundFirstKept = true;
			}
			if (foundFirstKept) {
				appendMessage(entry);
			}
		}

		// Emit messages after compaction
		for (let i = compactionIdx + 1; i < path.length; i++) {
			appendMessage(path[i]);
		}
	} else {
		// No compaction - emit all messages
		for (const entry of path) {
			appendMessage(entry);
		}
	}

	return { messages, model };
}
