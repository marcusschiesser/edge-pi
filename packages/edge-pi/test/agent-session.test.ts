import { describe, expect, it } from "vitest";
import { CodingAgent } from "../src/agent.js";
import { SessionManager } from "../src/session/session-manager.js";
import { assistantMsg, userMsg } from "./utilities.js";

/**
 * A mock model that satisfies the LanguageModel interface minimally.
 * We only test session integration logic here, not actual AI calls.
 */
const mockModel = {
	modelId: "test-model",
	provider: "test-provider",
	specificationVersion: "v1" as const,
	defaultObjectGenerationMode: undefined,
	supportsImageUrls: false,
	supportsStructuredOutputs: false,
	doGenerate: async () => {
		throw new Error("Not implemented in tests");
	},
	doStream: async () => {
		throw new Error("Not implemented in tests");
	},
} as any;

describe("CodingAgent SessionManager integration", () => {
	it("constructor auto-restores messages from sessionManager", () => {
		const session = SessionManager.inMemory();
		session.appendMessage(userMsg("hello"));
		session.appendMessage(assistantMsg("hi there"));

		const agent = new CodingAgent({
			model: mockModel,
			sessionManager: session,
		});

		expect(agent.messages).toHaveLength(2);
		expect(agent.messages[0]).toEqual(userMsg("hello"));
		expect(agent.messages[1]).toEqual(assistantMsg("hi there"));
		expect(agent.sessionManager).toBe(session);
	});

	it("works without sessionManager (backwards compatible)", () => {
		const agent = new CodingAgent({ model: mockModel });

		expect(agent.sessionManager).toBeUndefined();
		expect(agent.messages).toHaveLength(0);
	});

	it("sessionManager setter auto-restores messages", () => {
		const agent = new CodingAgent({ model: mockModel });
		expect(agent.messages).toHaveLength(0);

		const session = SessionManager.inMemory();
		session.appendMessage(userMsg("restored"));
		session.appendMessage(assistantMsg("from session"));

		agent.sessionManager = session;

		expect(agent.messages).toHaveLength(2);
		expect(agent.messages[0]).toEqual(userMsg("restored"));
		expect(agent.messages[1]).toEqual(assistantMsg("from session"));
	});

	it("sessionManager setter with undefined clears session but keeps messages", () => {
		const session = SessionManager.inMemory();
		session.appendMessage(userMsg("keep me"));

		const agent = new CodingAgent({
			model: mockModel,
			sessionManager: session,
		});
		expect(agent.messages).toHaveLength(1);

		agent.sessionManager = undefined;

		expect(agent.sessionManager).toBeUndefined();
		// Messages are NOT cleared when session is set to undefined
		expect(agent.messages).toHaveLength(1);
	});

	it("sessionManager setter replaces previous session", () => {
		const session1 = SessionManager.inMemory();
		session1.appendMessage(userMsg("from session 1"));

		const session2 = SessionManager.inMemory();
		session2.appendMessage(userMsg("from session 2"));
		session2.appendMessage(assistantMsg("response 2"));

		const agent = new CodingAgent({
			model: mockModel,
			sessionManager: session1,
		});
		expect(agent.messages).toHaveLength(1);
		expect(agent.messages[0]).toEqual(userMsg("from session 1"));

		agent.sessionManager = session2;

		expect(agent.sessionManager).toBe(session2);
		expect(agent.messages).toHaveLength(2);
		expect(agent.messages[0]).toEqual(userMsg("from session 2"));
		expect(agent.messages[1]).toEqual(assistantMsg("response 2"));
	});

	it("setMessages does not write to session", () => {
		const session = SessionManager.inMemory();

		const agent = new CodingAgent({
			model: mockModel,
			sessionManager: session,
		});

		agent.setMessages([userMsg("manual override")]);

		// Agent messages updated
		expect(agent.messages).toHaveLength(1);
		// Session should still be empty (setMessages doesn't persist)
		expect(session.getEntries()).toHaveLength(0);
	});

	it("exposes and updates compaction config at runtime", () => {
		const agent = new CodingAgent({ model: mockModel });

		expect(agent.compaction).toBeUndefined();

		agent.setCompaction({
			contextWindow: 200000,
			mode: "manual",
			settings: {
				reserveTokens: 16000,
				keepRecentTokens: 20000,
			},
		});

		expect(agent.compaction).toMatchObject({
			contextWindow: 200000,
			mode: "manual",
		});
	});

	it("compact() throws when compaction is not configured", async () => {
		const agent = new CodingAgent({ model: mockModel });

		await expect(agent.compact()).rejects.toThrow("Compaction not configured");
	});

	it("compact() returns undefined when no session manager is attached", async () => {
		const agent = new CodingAgent({
			model: mockModel,
			compaction: {
				contextWindow: 200000,
				mode: "manual",
			},
		});

		await expect(agent.compact()).resolves.toBeUndefined();
	});
});
