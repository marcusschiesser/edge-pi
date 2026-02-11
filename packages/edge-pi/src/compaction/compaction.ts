/**
 * Context compaction for long sessions.
 *
 * Generates summaries of older conversation history to free context window space.
 * Uses LLM-based summarization via generateText.
 */

import type { ProviderOptions } from "@ai-sdk/provider-utils";
import { generateText, type LanguageModel, type ModelMessage, type UserModelMessage } from "ai";
import type { CompactionEntry, SessionEntry } from "../session/types.js";
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

export interface CompactionDetails {
	readFiles: string[];
	modifiedFiles: string[];
}

export interface CompactionSettings {
	enabled: boolean;
	reserveTokens: number;
	keepRecentTokens: number;
}

export const DEFAULT_COMPACTION_SETTINGS: CompactionSettings = {
	enabled: true,
	reserveTokens: 16384,
	keepRecentTokens: 20000,
};

export interface CompactionResult<T = unknown> {
	summary: string;
	firstKeptEntryId: string;
	tokensBefore: number;
	details?: T;
}

export interface CutPointResult {
	firstKeptEntryIndex: number;
	turnStartIndex: number;
	isSplitTurn: boolean;
}

export interface CompactionPreparation {
	firstKeptEntryId: string;
	messagesToSummarize: ModelMessage[];
	turnPrefixMessages: ModelMessage[];
	isSplitTurn: boolean;
	tokensBefore: number;
	previousSummary?: string;
	fileOps: FileOperations;
	settings: CompactionSettings;
}

// ============================================================================
// Message Extraction
// ============================================================================

function getMessageFromEntry(entry: SessionEntry): ModelMessage | undefined {
	if (entry.type === "message") {
		return entry.message;
	}
	if (entry.type === "branch_summary" && entry.summary) {
		const msg: UserModelMessage = {
			role: "user",
			content: [{ type: "text", text: `<summary type="branch">\n${entry.summary}\n</summary>` }],
		};
		return msg;
	}
	if (entry.type === "compaction") {
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
	return undefined;
}

// ============================================================================
// File Operation Tracking
// ============================================================================

function extractFileOperations(
	messages: ModelMessage[],
	entries: SessionEntry[],
	prevCompactionIndex: number,
): FileOperations {
	const fileOps = createFileOps();

	if (prevCompactionIndex >= 0) {
		const prevCompaction = entries[prevCompactionIndex] as CompactionEntry;
		if (prevCompaction.details) {
			const details = prevCompaction.details as CompactionDetails;
			if (Array.isArray(details.readFiles)) {
				for (const f of details.readFiles) fileOps.read.add(f);
			}
			if (Array.isArray(details.modifiedFiles)) {
				for (const f of details.modifiedFiles) fileOps.edited.add(f);
			}
		}
	}

	for (const msg of messages) {
		extractFileOpsFromModelMessage(msg, fileOps);
	}

	return fileOps;
}

// ============================================================================
// Cut Point Detection
// ============================================================================

/**
 * Find valid cut points: user and assistant message entries.
 * Never cut at tool result messages.
 */
function findValidCutPoints(entries: SessionEntry[], startIndex: number, endIndex: number): number[] {
	const cutPoints: number[] = [];
	for (let i = startIndex; i < endIndex; i++) {
		const entry = entries[i];
		if (entry.type === "message") {
			const msg = entry.message;
			if (msg.role === "user" || msg.role === "assistant") {
				cutPoints.push(i);
			}
			// Never cut at tool results
		}
		if (entry.type === "branch_summary") {
			cutPoints.push(i);
		}
	}
	return cutPoints;
}

function findTurnStartIndex(entries: SessionEntry[], entryIndex: number, startIndex: number): number {
	for (let i = entryIndex; i >= startIndex; i--) {
		const entry = entries[i];
		if (entry.type === "branch_summary") {
			return i;
		}
		if (entry.type === "message") {
			if (entry.message.role === "user") {
				return i;
			}
		}
	}
	return -1;
}

/**
 * Find the cut point that keeps approximately keepRecentTokens.
 */
export function findCutPoint(
	entries: SessionEntry[],
	startIndex: number,
	endIndex: number,
	keepRecentTokens: number,
): CutPointResult {
	const cutPoints = findValidCutPoints(entries, startIndex, endIndex);

	if (cutPoints.length === 0) {
		return { firstKeptEntryIndex: startIndex, turnStartIndex: -1, isSplitTurn: false };
	}

	let accumulatedTokens = 0;
	let cutIndex = cutPoints[0];

	for (let i = endIndex - 1; i >= startIndex; i--) {
		const entry = entries[i];
		if (entry.type !== "message") continue;

		const messageTokens = estimateTokens(entry.message);
		accumulatedTokens += messageTokens;

		if (accumulatedTokens >= keepRecentTokens) {
			for (let c = 0; c < cutPoints.length; c++) {
				if (cutPoints[c] >= i) {
					cutIndex = cutPoints[c];
					break;
				}
			}
			break;
		}
	}

	// Scan backwards to include non-message entries
	while (cutIndex > startIndex) {
		const prevEntry = entries[cutIndex - 1];
		if (prevEntry.type === "compaction" || prevEntry.type === "message") {
			break;
		}
		cutIndex--;
	}

	const cutEntry = entries[cutIndex];
	const isUserMessage = cutEntry.type === "message" && cutEntry.message.role === "user";
	const turnStartIndex = isUserMessage ? -1 : findTurnStartIndex(entries, cutIndex, startIndex);

	return {
		firstKeptEntryIndex: cutIndex,
		turnStartIndex,
		isSplitTurn: !isUserMessage && turnStartIndex !== -1,
	};
}

// ============================================================================
// Compaction Preparation
// ============================================================================

export function prepareCompaction(
	pathEntries: SessionEntry[],
	settings: CompactionSettings,
): CompactionPreparation | undefined {
	if (pathEntries.length > 0 && pathEntries[pathEntries.length - 1].type === "compaction") {
		return undefined;
	}

	let prevCompactionIndex = -1;
	for (let i = pathEntries.length - 1; i >= 0; i--) {
		if (pathEntries[i].type === "compaction") {
			prevCompactionIndex = i;
			break;
		}
	}
	const boundaryStart = prevCompactionIndex + 1;
	const boundaryEnd = pathEntries.length;

	const usageStart = prevCompactionIndex >= 0 ? prevCompactionIndex : 0;
	const usageMessages: ModelMessage[] = [];
	for (let i = usageStart; i < boundaryEnd; i++) {
		const msg = getMessageFromEntry(pathEntries[i]);
		if (msg) usageMessages.push(msg);
	}

	let tokensBefore = 0;
	for (const msg of usageMessages) {
		tokensBefore += estimateTokens(msg);
	}

	const cutPoint = findCutPoint(pathEntries, boundaryStart, boundaryEnd, settings.keepRecentTokens);

	const firstKeptEntry = pathEntries[cutPoint.firstKeptEntryIndex];
	if (!firstKeptEntry?.id) {
		return undefined;
	}
	const firstKeptEntryId = firstKeptEntry.id;

	const historyEnd = cutPoint.isSplitTurn ? cutPoint.turnStartIndex : cutPoint.firstKeptEntryIndex;

	const messagesToSummarize: ModelMessage[] = [];
	for (let i = boundaryStart; i < historyEnd; i++) {
		const msg = getMessageFromEntry(pathEntries[i]);
		if (msg) messagesToSummarize.push(msg);
	}

	const turnPrefixMessages: ModelMessage[] = [];
	if (cutPoint.isSplitTurn) {
		for (let i = cutPoint.turnStartIndex; i < cutPoint.firstKeptEntryIndex; i++) {
			const msg = getMessageFromEntry(pathEntries[i]);
			if (msg) turnPrefixMessages.push(msg);
		}
	}

	let previousSummary: string | undefined;
	if (prevCompactionIndex >= 0) {
		const prevCompaction = pathEntries[prevCompactionIndex] as CompactionEntry;
		previousSummary = prevCompaction.summary;
	}

	const fileOps = extractFileOperations(messagesToSummarize, pathEntries, prevCompactionIndex);

	if (cutPoint.isSplitTurn) {
		for (const msg of turnPrefixMessages) {
			extractFileOpsFromModelMessage(msg, fileOps);
		}
	}

	return {
		firstKeptEntryId,
		messagesToSummarize,
		turnPrefixMessages,
		isSplitTurn: cutPoint.isSplitTurn,
		tokensBefore,
		previousSummary,
		fileOps,
		settings,
	};
}

// ============================================================================
// Summarization
// ============================================================================

const SUMMARIZATION_PROMPT = `The messages above are a conversation to summarize. Create a structured context checkpoint summary that another LLM will use to continue the work.

Use this EXACT format:

## Goal
[What is the user trying to accomplish? Can be multiple items if the session covers different tasks.]

## Constraints & Preferences
- [Any constraints, preferences, or requirements mentioned by user]
- [Or "(none)" if none were mentioned]

## Progress
### Done
- [x] [Completed tasks/changes]

### In Progress
- [ ] [Current work]

### Blocked
- [Issues preventing progress, if any]

## Key Decisions
- **[Decision]**: [Brief rationale]

## Next Steps
1. [Ordered list of what should happen next]

## Critical Context
- [Any data, examples, or references needed to continue]
- [Or "(none)" if not applicable]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

const UPDATE_SUMMARIZATION_PROMPT = `The messages above are NEW conversation messages to incorporate into the existing summary provided in <previous-summary> tags.

Update the existing structured summary with new information. RULES:
- PRESERVE all existing information from the previous summary
- ADD new progress, decisions, and context from the new messages
- UPDATE the Progress section: move items from "In Progress" to "Done" when completed
- UPDATE "Next Steps" based on what was accomplished
- PRESERVE exact file paths, function names, and error messages
- If something is no longer relevant, you may remove it

Use this EXACT format:

## Goal
[Preserve existing goals, add new ones if the task expanded]

## Constraints & Preferences
- [Preserve existing, add new ones discovered]

## Progress
### Done
- [x] [Include previously done items AND newly completed items]

### In Progress
- [ ] [Current work - update based on progress]

### Blocked
- [Current blockers - remove if resolved]

## Key Decisions
- **[Decision]**: [Brief rationale] (preserve all previous, add new)

## Next Steps
1. [Update based on current state]

## Critical Context
- [Preserve important context, add new if needed]

Keep each section concise. Preserve exact file paths, function names, and error messages.`;

const TURN_PREFIX_SUMMARIZATION_PROMPT = `This is the PREFIX of a turn that was too large to keep. The SUFFIX (recent work) is retained.

Summarize the prefix to provide context for the retained suffix:

## Original Request
[What did the user ask for in this turn?]

## Early Progress
- [Key decisions and work done in the prefix]

## Context for Suffix
- [Information needed to understand the retained recent work]

Be concise. Focus on what's needed to understand the kept suffix.`;

async function generateSummary(
	currentMessages: ModelMessage[],
	model: LanguageModel,
	reserveTokens: number,
	providerOptions: ProviderOptions | undefined,
	signal?: AbortSignal,
	previousSummary?: string,
): Promise<string> {
	const maxTokens = Math.floor(0.8 * reserveTokens);

	const basePrompt = previousSummary ? UPDATE_SUMMARIZATION_PROMPT : SUMMARIZATION_PROMPT;
	const conversationText = serializeModelMessages(currentMessages);

	let promptText = `<conversation>\n${conversationText}\n</conversation>\n\n`;
	if (previousSummary) {
		promptText += `<previous-summary>\n${previousSummary}\n</previous-summary>\n\n`;
	}
	promptText += basePrompt;

	const response = await generateText({
		model,
		system: SUMMARIZATION_SYSTEM_PROMPT,
		messages: [{ role: "user" as const, content: [{ type: "text", text: promptText }] }],
		providerOptions,
		maxOutputTokens: maxTokens,
		abortSignal: signal,
	});

	return response.text;
}

async function generateTurnPrefixSummary(
	messages: ModelMessage[],
	model: LanguageModel,
	reserveTokens: number,
	providerOptions: ProviderOptions | undefined,
	signal?: AbortSignal,
): Promise<string> {
	const maxTokens = Math.floor(0.5 * reserveTokens);
	const conversationText = serializeModelMessages(messages);
	const promptText = `<conversation>\n${conversationText}\n</conversation>\n\n${TURN_PREFIX_SUMMARIZATION_PROMPT}`;

	const response = await generateText({
		model,
		system: SUMMARIZATION_SYSTEM_PROMPT,
		messages: [{ role: "user" as const, content: [{ type: "text", text: promptText }] }],
		providerOptions,
		maxOutputTokens: maxTokens,
		abortSignal: signal,
	});

	return response.text;
}

// ============================================================================
// Main compaction function
// ============================================================================

/**
 * Generate summaries for compaction using prepared data.
 */
export async function compact(
	preparation: CompactionPreparation,
	model: LanguageModel,
	providerOptions?: ProviderOptions,
	signal?: AbortSignal,
): Promise<CompactionResult> {
	const {
		firstKeptEntryId,
		messagesToSummarize,
		turnPrefixMessages,
		isSplitTurn,
		tokensBefore,
		previousSummary,
		fileOps,
		settings,
	} = preparation;

	let summary: string;

	if (isSplitTurn && turnPrefixMessages.length > 0) {
		const [historyResult, turnPrefixResult] = await Promise.all([
			messagesToSummarize.length > 0
				? generateSummary(
						messagesToSummarize,
						model,
						settings.reserveTokens,
						providerOptions,
						signal,
						previousSummary,
					)
				: Promise.resolve("No prior history."),
			generateTurnPrefixSummary(turnPrefixMessages, model, settings.reserveTokens, providerOptions, signal),
		]);
		summary = `${historyResult}\n\n---\n\n**Turn Context (split turn):**\n\n${turnPrefixResult}`;
	} else {
		summary = await generateSummary(
			messagesToSummarize,
			model,
			settings.reserveTokens,
			providerOptions,
			signal,
			previousSummary,
		);
	}

	const { readFiles, modifiedFiles } = computeFileLists(fileOps);
	summary += formatFileOperations(readFiles, modifiedFiles);

	return {
		summary,
		firstKeptEntryId,
		tokensBefore,
		details: { readFiles, modifiedFiles } as CompactionDetails,
	};
}
