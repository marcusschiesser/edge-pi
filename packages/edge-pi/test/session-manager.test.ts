import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SessionManager } from "../src/session/session-manager.js";
import { assistantMsg, userMsg } from "./utilities.js";

describe("SessionManager append and tree traversal", () => {
	describe("append operations", () => {
		it("appendMessage creates entry with correct parentId chain", () => {
			const session = SessionManager.inMemory();

			const id1 = session.appendMessage(userMsg("first"));
			const id2 = session.appendMessage(assistantMsg("second"));
			const id3 = session.appendMessage(userMsg("third"));

			const entries = session.getEntries();
			expect(entries).toHaveLength(3);

			expect(entries[0].id).toBe(id1);
			expect(entries[0].parentId).toBeNull();
			expect(entries[0].type).toBe("message");

			expect(entries[1].id).toBe(id2);
			expect(entries[1].parentId).toBe(id1);

			expect(entries[2].id).toBe(id3);
			expect(entries[2].parentId).toBe(id2);
		});

		it("appendModelChange integrates into tree", () => {
			const session = SessionManager.inMemory();

			const msgId = session.appendMessage(userMsg("hello"));
			const modelId = session.appendModelChange("openai", "gpt-4");
			session.appendMessage(assistantMsg("response"));

			const entries = session.getEntries();
			expect(entries).toHaveLength(3);

			const modelEntry = entries.find((e) => e.type === "model_change");
			expect(modelEntry).toBeDefined();
			expect(modelEntry!.id).toBe(modelId);
			expect(modelEntry!.parentId).toBe(msgId);
			if (modelEntry?.type === "model_change") {
				expect(modelEntry.provider).toBe("openai");
				expect(modelEntry.modelId).toBe("gpt-4");
			}

			expect(entries[2].parentId).toBe(modelId);
		});

		it("appendCompaction integrates into tree", () => {
			const session = SessionManager.inMemory();

			const id1 = session.appendMessage(userMsg("1"));
			const id2 = session.appendMessage(assistantMsg("2"));
			const compactionId = session.appendCompaction("summary", id1, 1000);
			session.appendMessage(userMsg("3"));

			const entries = session.getEntries();
			const compactionEntry = entries.find((e) => e.type === "compaction");
			expect(compactionEntry).toBeDefined();
			expect(compactionEntry?.id).toBe(compactionId);
			expect(compactionEntry?.parentId).toBe(id2);
			if (compactionEntry?.type === "compaction") {
				expect(compactionEntry.summary).toBe("summary");
				expect(compactionEntry.firstKeptEntryId).toBe(id1);
				expect(compactionEntry.tokensBefore).toBe(1000);
			}

			expect(entries[3].parentId).toBe(compactionId);
		});

		it("leaf pointer advances after each append", () => {
			const session = SessionManager.inMemory();

			expect(session.getLeafId()).toBeNull();

			const id1 = session.appendMessage(userMsg("1"));
			expect(session.getLeafId()).toBe(id1);

			const id2 = session.appendMessage(assistantMsg("2"));
			expect(session.getLeafId()).toBe(id2);
		});
	});

	describe("getBranch", () => {
		it("returns empty array for empty session", () => {
			const session = SessionManager.inMemory();
			expect(session.getBranch()).toEqual([]);
		});

		it("returns single entry path", () => {
			const session = SessionManager.inMemory();
			const id = session.appendMessage(userMsg("hello"));

			const path = session.getBranch();
			expect(path).toHaveLength(1);
			expect(path[0].id).toBe(id);
		});

		it("returns full path from root to leaf", () => {
			const session = SessionManager.inMemory();

			const id1 = session.appendMessage(userMsg("1"));
			const id2 = session.appendMessage(assistantMsg("2"));
			const id3 = session.appendMessage(userMsg("3"));

			const path = session.getBranch();
			expect(path).toHaveLength(3);
			expect(path.map((e) => e.id)).toEqual([id1, id2, id3]);
		});

		it("returns path from specified entry to root", () => {
			const session = SessionManager.inMemory();

			const id1 = session.appendMessage(userMsg("1"));
			const id2 = session.appendMessage(assistantMsg("2"));
			session.appendMessage(userMsg("3"));

			const path = session.getBranch(id2);
			expect(path).toHaveLength(2);
			expect(path.map((e) => e.id)).toEqual([id1, id2]);
		});
	});

	describe("getTree", () => {
		it("returns empty array for empty session", () => {
			const session = SessionManager.inMemory();
			expect(session.getTree()).toEqual([]);
		});

		it("returns single root for linear session", () => {
			const session = SessionManager.inMemory();

			const id1 = session.appendMessage(userMsg("1"));
			const id2 = session.appendMessage(assistantMsg("2"));
			const id3 = session.appendMessage(userMsg("3"));

			const tree = session.getTree();
			expect(tree).toHaveLength(1);

			const root = tree[0];
			expect(root.entry.id).toBe(id1);
			expect(root.children).toHaveLength(1);
			expect(root.children[0].entry.id).toBe(id2);
			expect(root.children[0].children).toHaveLength(1);
			expect(root.children[0].children[0].entry.id).toBe(id3);
			expect(root.children[0].children[0].children).toHaveLength(0);
		});

		it("returns tree with branches", () => {
			const session = SessionManager.inMemory();

			session.appendMessage(userMsg("1"));
			const id2 = session.appendMessage(assistantMsg("2"));
			const id3 = session.appendMessage(userMsg("3"));

			// Branch from id2, add new path
			session.branch(id2);
			const id4 = session.appendMessage(userMsg("4-branch"));

			const tree = session.getTree();
			expect(tree).toHaveLength(1);

			const node2 = tree[0].children[0];
			expect(node2.entry.id).toBe(id2);
			expect(node2.children).toHaveLength(2); // id3 and id4

			const childIds = node2.children.map((c) => c.entry.id).sort();
			expect(childIds).toEqual([id3, id4].sort());
		});

		it("handles multiple branches at same point", () => {
			const session = SessionManager.inMemory();

			session.appendMessage(userMsg("root"));
			const id2 = session.appendMessage(assistantMsg("response"));

			session.branch(id2);
			const idA = session.appendMessage(userMsg("branch-A"));

			session.branch(id2);
			const idB = session.appendMessage(userMsg("branch-B"));

			session.branch(id2);
			const idC = session.appendMessage(userMsg("branch-C"));

			const tree = session.getTree();
			const node2 = tree[0].children[0];
			expect(node2.entry.id).toBe(id2);
			expect(node2.children).toHaveLength(3);

			const branchIds = node2.children.map((c) => c.entry.id).sort();
			expect(branchIds).toEqual([idA, idB, idC].sort());
		});
	});

	describe("branch", () => {
		it("moves leaf pointer to specified entry", () => {
			const session = SessionManager.inMemory();

			const id1 = session.appendMessage(userMsg("1"));
			session.appendMessage(assistantMsg("2"));
			const id3 = session.appendMessage(userMsg("3"));

			expect(session.getLeafId()).toBe(id3);

			session.branch(id1);
			expect(session.getLeafId()).toBe(id1);
		});

		it("throws for non-existent entry", () => {
			const session = SessionManager.inMemory();
			session.appendMessage(userMsg("hello"));

			expect(() => session.branch("nonexistent")).toThrow("Entry nonexistent not found");
		});

		it("new appends become children of branch point", () => {
			const session = SessionManager.inMemory();

			const id1 = session.appendMessage(userMsg("1"));
			session.appendMessage(assistantMsg("2"));

			session.branch(id1);
			const id3 = session.appendMessage(userMsg("branched"));

			const entries = session.getEntries();
			const branchedEntry = entries.find((e) => e.id === id3)!;
			expect(branchedEntry.parentId).toBe(id1);
		});
	});

	describe("branchWithSummary", () => {
		it("inserts branch summary and advances leaf", () => {
			const session = SessionManager.inMemory();

			const id1 = session.appendMessage(userMsg("1"));
			session.appendMessage(assistantMsg("2"));
			session.appendMessage(userMsg("3"));

			const summaryId = session.branchWithSummary(id1, "Summary of abandoned work");

			expect(session.getLeafId()).toBe(summaryId);

			const entries = session.getEntries();
			const summaryEntry = entries.find((e) => e.type === "branch_summary");
			expect(summaryEntry).toBeDefined();
			expect(summaryEntry?.parentId).toBe(id1);
			if (summaryEntry?.type === "branch_summary") {
				expect(summaryEntry.summary).toBe("Summary of abandoned work");
			}
		});

		it("throws for non-existent entry", () => {
			const session = SessionManager.inMemory();
			session.appendMessage(userMsg("hello"));

			expect(() => session.branchWithSummary("nonexistent", "summary")).toThrow("Entry nonexistent not found");
		});
	});

	describe("getLeafEntry", () => {
		it("returns undefined for empty session", () => {
			const session = SessionManager.inMemory();
			expect(session.getLeafEntry()).toBeUndefined();
		});

		it("returns current leaf entry", () => {
			const session = SessionManager.inMemory();

			session.appendMessage(userMsg("1"));
			const id2 = session.appendMessage(assistantMsg("2"));

			const leaf = session.getLeafEntry();
			expect(leaf).toBeDefined();
			expect(leaf!.id).toBe(id2);
		});
	});

	describe("getEntry", () => {
		it("returns undefined for non-existent id", () => {
			const session = SessionManager.inMemory();
			expect(session.getEntry("nonexistent")).toBeUndefined();
		});

		it("returns entry by id", () => {
			const session = SessionManager.inMemory();

			const id1 = session.appendMessage(userMsg("first"));
			const id2 = session.appendMessage(assistantMsg("second"));

			expect(session.getEntry(id1)).toBeDefined();
			expect(session.getEntry(id1)?.type).toBe("message");
			expect(session.getEntry(id2)).toBeDefined();
		});
	});

	describe("session metadata", () => {
		it("getSessionId returns non-empty string", () => {
			const session = SessionManager.inMemory();
			expect(session.getSessionId()).toBeTruthy();
		});

		it("getCwd returns provided cwd", () => {
			const session = SessionManager.inMemory("/custom/path");
			expect(session.getCwd()).toBe("/custom/path");
		});

		it("getHeader returns session header", () => {
			const session = SessionManager.inMemory();
			const header = session.getHeader();
			expect(header).toBeDefined();
			expect(header!.type).toBe("session");
			expect(header!.id).toBeTruthy();
		});
	});
});

describe("SessionManager file persistence", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `edge-pi-session-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(tempDir, { recursive: true });
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("create() creates a persisted session", () => {
		const session = SessionManager.create(tempDir, tempDir);
		session.appendMessage(userMsg("hello"));
		session.appendMessage(assistantMsg("hi"));

		const sessionFile = session.getSessionFile();
		expect(sessionFile).toBeTruthy();
		expect(existsSync(sessionFile!)).toBe(true);

		const content = readFileSync(sessionFile!, "utf-8");
		expect(content).toContain("hello");
		expect(content).toContain("session");
	});

	it("open() loads an existing session", () => {
		const session1 = SessionManager.create(tempDir, tempDir);
		session1.appendMessage(userMsg("hello"));
		session1.appendMessage(assistantMsg("hi"));
		const sessionFile = session1.getSessionFile()!;

		const session2 = SessionManager.open(sessionFile);
		const entries = session2.getEntries();
		expect(entries).toHaveLength(2);
		expect(entries[0].type).toBe("message");
	});

	it("newSession creates a fresh session with new file", () => {
		const session = SessionManager.create(tempDir, tempDir);
		session.appendMessage(userMsg("old"));

		const file1 = session.getSessionFile();
		session.newSession();
		const file2 = session.getSessionFile();

		expect(file1).not.toBe(file2);
		expect(session.getEntries()).toHaveLength(0);
	});
});

describe("SessionManager buildSessionContext", () => {
	it("returns messages from current branch only", () => {
		const session = SessionManager.inMemory();

		session.appendMessage(userMsg("msg1"));
		const id2 = session.appendMessage(assistantMsg("msg2"));
		session.appendMessage(userMsg("msg3"));

		// Branch from id2: should see msg1, msg2, msg4-branch (not msg3)
		session.branch(id2);
		session.appendMessage(assistantMsg("msg4-branch"));

		const ctx = session.buildSessionContext();
		expect(ctx.messages).toHaveLength(3);
	});
});
