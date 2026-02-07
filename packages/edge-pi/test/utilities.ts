/**
 * Shared test utilities for edge-pi tests.
 */

import type { AssistantModelMessage, ModelMessage, ToolModelMessage, UserModelMessage } from "ai";
import type { MessageEntry, SessionEntry } from "../src/session/types.js";

/**
 * Create a minimal user ModelMessage for testing.
 */
export function userMsg(text: string): UserModelMessage {
	return {
		role: "user",
		content: [{ type: "text", text }],
	};
}

/**
 * Create a minimal assistant ModelMessage for testing.
 */
export function assistantMsg(text: string): AssistantModelMessage {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
	};
}

/**
 * Create an assistant message with tool calls.
 */
export function assistantToolCallMsg(
	toolName: string,
	input: Record<string, unknown>,
	toolCallId = "tc-1",
): AssistantModelMessage {
	return {
		role: "assistant",
		content: [
			{
				type: "tool-call",
				toolCallId,
				toolName,
				input,
			},
		],
	};
}

/**
 * Create a tool result message.
 */
export function toolResultMsg(toolCallId: string, toolName: string, output: string): ToolModelMessage {
	return {
		role: "tool",
		content: [
			{
				type: "tool-result",
				toolCallId,
				toolName,
				output: { type: "text", value: output },
			},
		],
	};
}

// ============================================================================
// Session entry builders
// ============================================================================

let entryCounter = 0;
let lastId: string | null = null;

export function resetEntryCounter(): void {
	entryCounter = 0;
	lastId = null;
}

export function createMessageEntry(message: ModelMessage): MessageEntry {
	const id = `test-id-${entryCounter++}`;
	const entry: MessageEntry = {
		type: "message",
		id,
		parentId: lastId,
		timestamp: new Date().toISOString(),
		message,
	};
	lastId = id;
	return entry;
}

export function createCompactionEntry(summary: string, firstKeptEntryId: string, tokensBefore = 10000): SessionEntry {
	const id = `test-id-${entryCounter++}`;
	const entry: SessionEntry = {
		type: "compaction",
		id,
		parentId: lastId,
		timestamp: new Date().toISOString(),
		summary,
		firstKeptEntryId,
		tokensBefore,
	};
	lastId = id;
	return entry;
}

export function createModelChangeEntry(provider: string, modelId: string): SessionEntry {
	const id = `test-id-${entryCounter++}`;
	const entry: SessionEntry = {
		type: "model_change",
		id,
		parentId: lastId,
		timestamp: new Date().toISOString(),
		provider,
		modelId,
	};
	lastId = id;
	return entry;
}

export function createBranchSummaryEntry(summary: string, fromId: string): SessionEntry {
	const id = `test-id-${entryCounter++}`;
	const entry: SessionEntry = {
		type: "branch_summary",
		id,
		parentId: lastId,
		timestamp: new Date().toISOString(),
		fromId,
		summary,
	};
	lastId = id;
	return entry;
}

/**
 * Helper function to create a session entry with explicit id/parentId.
 * Useful for build-context tests where you need exact tree structure.
 */
export function msg(id: string, parentId: string | null, role: "user" | "assistant", text: string): MessageEntry {
	if (role === "user") {
		return {
			type: "message",
			id,
			parentId,
			timestamp: "2025-01-01T00:00:00Z",
			message: userMsg(text),
		};
	}
	return {
		type: "message",
		id,
		parentId,
		timestamp: "2025-01-01T00:00:00Z",
		message: assistantMsg(text),
	};
}
