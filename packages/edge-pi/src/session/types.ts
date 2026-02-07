/**
 * Session entry types for JSONL tree storage.
 * Entries store ModelMessage directly (native Vercel AI types).
 */

import type { ModelMessage } from "ai";

export interface SessionHeader {
	type: "session";
	version: number;
	id: string;
	timestamp: string;
	cwd: string;
	parentSession?: string;
}

export interface SessionEntryBase {
	type: string;
	id: string;
	parentId: string | null;
	timestamp: string;
}

/** A message entry that stores a native ModelMessage */
export interface MessageEntry extends SessionEntryBase {
	type: "message";
	message: ModelMessage;
}

/** Compaction entry - summary of discarded context */
export interface CompactionEntry<T = unknown> extends SessionEntryBase {
	type: "compaction";
	summary: string;
	firstKeptEntryId: string;
	tokensBefore: number;
	details?: T;
}

/** Branch summary entry - summary of an abandoned branch */
export interface BranchSummaryEntry<T = unknown> extends SessionEntryBase {
	type: "branch_summary";
	fromId: string;
	summary: string;
	details?: T;
}

/** Model change entry */
export interface ModelChangeEntry extends SessionEntryBase {
	type: "model_change";
	provider: string;
	modelId: string;
}

/** Union of all session entry types */
export type SessionEntry = MessageEntry | CompactionEntry | BranchSummaryEntry | ModelChangeEntry;

/** Raw file entry (includes header) */
export type FileEntry = SessionHeader | SessionEntry;

/** Tree node for getTree() */
export interface SessionTreeNode {
	entry: SessionEntry;
	children: SessionTreeNode[];
}
