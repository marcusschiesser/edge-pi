import type { SessionContext } from "./context.js";
import type { BranchSummaryEntry, CompactionEntry, SessionEntry, SessionHeader, SessionTreeNode } from "./types.js";

const ERROR_MESSAGE =
	"SessionManager is unavailable in browser builds. Use edge-pi without session persistence in the browser.";

function unsupported(): never {
	throw new Error(ERROR_MESSAGE);
}

export class SessionManager {
	private constructor() {}

	private static unsupported(): never {
		return unsupported();
	}

	static create(_cwd: string, _sessionDir: string): SessionManager {
		return SessionManager.unsupported();
	}

	static open(_path: string, _sessionDir?: string): SessionManager {
		return SessionManager.unsupported();
	}

	static inMemory(_cwd?: string): SessionManager {
		return SessionManager.unsupported();
	}

	setSessionFile(_sessionFile: string): void {
		SessionManager.unsupported();
	}

	newSession(): string | undefined {
		return SessionManager.unsupported();
	}

	isPersisted(): boolean {
		return SessionManager.unsupported();
	}

	getCwd(): string {
		return SessionManager.unsupported();
	}

	getSessionDir(): string {
		return SessionManager.unsupported();
	}

	getSessionId(): string {
		return SessionManager.unsupported();
	}

	getSessionFile(): string | undefined {
		return SessionManager.unsupported();
	}

	appendMessage(_message: unknown): string {
		return SessionManager.unsupported();
	}

	appendModelChange(_provider: string, _modelId: string): string {
		return SessionManager.unsupported();
	}

	appendCompaction<T = unknown>(
		_summary: string,
		_firstKeptEntryId: string,
		_tokensBefore: number,
		_details?: T,
	): string {
		return SessionManager.unsupported();
	}

	getLeafId(): string | null {
		return SessionManager.unsupported();
	}

	getLeafEntry(): SessionEntry | undefined {
		return SessionManager.unsupported();
	}

	getEntry(_id: string): SessionEntry | undefined {
		return SessionManager.unsupported();
	}

	getBranch(_fromId?: string): SessionEntry[] {
		return SessionManager.unsupported();
	}

	buildSessionContext(): SessionContext {
		return SessionManager.unsupported();
	}

	getHeader(): SessionHeader | null {
		return SessionManager.unsupported();
	}

	getEntries(): SessionEntry[] {
		return SessionManager.unsupported();
	}

	getTree(): SessionTreeNode[] {
		return SessionManager.unsupported();
	}

	branch(_branchFromId: string): void {
		SessionManager.unsupported();
	}

	resetLeaf(): void {
		SessionManager.unsupported();
	}

	branchWithSummary(_branchFromId: string | null, _summary: string, _details?: unknown): string {
		return SessionManager.unsupported();
	}
}

export function parseSessionEntries(_content: string): SessionEntry[] {
	return unsupported();
}

export function loadEntriesFromFile(_filePath: string): Array<SessionHeader | SessionEntry> {
	return unsupported();
}

export type { BranchSummaryEntry, CompactionEntry, SessionEntry, SessionHeader, SessionTreeNode };
