/**
 * Branch summarization for tree navigation.
 *
 * When navigating to a different point in the session tree, this generates
 * a summary of the branch being left so context isn't lost.
 */

import { generateText, type LanguageModel, type ModelMessage, type UserModelMessage } from "ai";
import type { SessionManager } from "../session/session-manager.js";
import type { SessionEntry } from "../session/types.js";
import { estimateTokens } from "./token-estimation.js";
import {
	computeFileLists,
	createFileOps,
	extractFileOpsFromModelMessage,
	type FileOperations,
	formatFileOperations,
	SUMMARIZATION_SYSTEM_PROMPT,
	serializeModelMessages,
} from "./utils.js";

// ============================================================================
// Types
// ============================================================================

export interface BranchSummaryResult {
	summary?: string;
	readFiles?: string[];
	modifiedFiles?: string[];
	aborted?: boolean;
	error?: string;
}

export interface BranchSummaryDetails {
	readFiles: string[];
	modifiedFiles: string[];
}

export interface CollectEntriesResult {
	entries: SessionEntry[];
	commonAncestorId: string | null;
}

export interface GenerateBranchSummaryOptions {
	model: LanguageModel;
	signal: AbortSignal;
	reserveTokens?: number;
	contextWindow?: number;
}

// ============================================================================
// Entry Collection
// ============================================================================

/**
 * Collect entries that should be summarized when navigating from one position to another.
 */
export function collectEntriesForBranchSummary(
	session: SessionManager,
	oldLeafId: string | null,
	targetId: string,
): CollectEntriesResult {
	if (!oldLeafId) {
		return { entries: [], commonAncestorId: null };
	}

	const oldPath = new Set(session.getBranch(oldLeafId).map((e) => e.id));
	const targetPath = session.getBranch(targetId);

	let commonAncestorId: string | null = null;
	for (let i = targetPath.length - 1; i >= 0; i--) {
		if (oldPath.has(targetPath[i].id)) {
			commonAncestorId = targetPath[i].id;
			break;
		}
	}

	const entries: SessionEntry[] = [];
	let current: string | null = oldLeafId;

	while (current && current !== commonAncestorId) {
		const entry = session.getEntry(current);
		if (!entry) break;
		entries.push(entry);
		current = entry.parentId;
	}

	entries.reverse();

	return { entries, commonAncestorId };
}

// ============================================================================
// Entry to Message Conversion
// ============================================================================

function getMessageFromEntry(entry: SessionEntry): ModelMessage | undefined {
	switch (entry.type) {
		case "message":
			if (entry.message.role === "tool") return undefined;
			return entry.message;

		case "branch_summary": {
			const msg: UserModelMessage = {
				role: "user",
				content: [{ type: "text", text: `<summary type="branch">\n${entry.summary}\n</summary>` }],
			};
			return msg;
		}

		case "compaction": {
			const msg: UserModelMessage = {
				role: "user",
				content: [
					{
						type: "text",
						text: `<summary type="compaction" tokens_before="${entry.tokensBefore}">\n${entry.summary}\n</summary>`,
					},
				],
			};
			return msg;
		}

		case "model_change":
			return undefined;
	}
}

/**
 * Prepare entries for summarization with token budget.
 */
function prepareBranchEntries(
	entries: SessionEntry[],
	tokenBudget: number = 0,
): { messages: ModelMessage[]; fileOps: FileOperations; totalTokens: number } {
	const messages: ModelMessage[] = [];
	const fileOps = createFileOps();
	let totalTokens = 0;

	// First pass: collect file ops from branch_summary entries
	for (const entry of entries) {
		if (entry.type === "branch_summary" && entry.details) {
			const details = entry.details as BranchSummaryDetails;
			if (Array.isArray(details.readFiles)) {
				for (const f of details.readFiles) fileOps.read.add(f);
			}
			if (Array.isArray(details.modifiedFiles)) {
				for (const f of details.modifiedFiles) fileOps.edited.add(f);
			}
		}
	}

	// Second pass: walk from newest to oldest
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		const message = getMessageFromEntry(entry);
		if (!message) continue;

		extractFileOpsFromModelMessage(message, fileOps);

		const tokens = estimateTokens(message);

		if (tokenBudget > 0 && totalTokens + tokens > tokenBudget) {
			if (entry.type === "compaction" || entry.type === "branch_summary") {
				if (totalTokens < tokenBudget * 0.9) {
					messages.unshift(message);
					totalTokens += tokens;
				}
			}
			break;
		}

		messages.unshift(message);
		totalTokens += tokens;
	}

	return { messages, fileOps, totalTokens };
}

// ============================================================================
// Summary Generation
// ============================================================================

const BRANCH_SUMMARY_PREAMBLE = `The user explored a different conversation branch before returning here.
Summary of that exploration:

`;

const BRANCH_SUMMARY_PROMPT = `Create a structured summary of this conversation branch for context when returning later.

Use this EXACT format:

## Goal
[What was the user trying to accomplish in this branch?]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Work that was started but not finished]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [What should happen next to continue this work]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

/**
 * Generate a summary of abandoned branch entries.
 */
export async function generateBranchSummary(
	entries: SessionEntry[],
	options: GenerateBranchSummaryOptions,
): Promise<BranchSummaryResult> {
	const { model, signal, reserveTokens = 16384, contextWindow = 128000 } = options;

	const tokenBudget = contextWindow - reserveTokens;

	const { messages, fileOps } = prepareBranchEntries(entries, tokenBudget);

	if (messages.length === 0) {
		return { summary: "No content to summarize" };
	}

	const conversationText = serializeModelMessages(messages);
	const promptText = `<conversation>\n${conversationText}\n</conversation>\n\n${BRANCH_SUMMARY_PROMPT}`;

	try {
		const response = await generateText({
			model,
			system: SUMMARIZATION_SYSTEM_PROMPT,
			messages: [{ role: "user" as const, content: [{ type: "text", text: promptText }] }],
			maxOutputTokens: 2048,
			abortSignal: signal,
		});

		let summary = BRANCH_SUMMARY_PREAMBLE + response.text;

		const { readFiles, modifiedFiles } = computeFileLists(fileOps);
		summary += formatFileOperations(readFiles, modifiedFiles);

		return {
			summary: summary || "No summary generated",
			readFiles,
			modifiedFiles,
		};
	} catch (err: any) {
		if (signal.aborted) {
			return { aborted: true };
		}
		return { error: err.message || "Summarization failed" };
	}
}
