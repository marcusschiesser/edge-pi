import { describe, expect, it } from "vitest";
import { CodingAgent } from "../src/agent.js";
import { createNodeRuntime } from "../src/runtime/node-runtime.js";
import type { EdgePiRuntime } from "../src/runtime/types.js";
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

function mockReadFile(_path: string): Promise<Uint8Array>;
function mockReadFile(_path: string, _encoding: BufferEncoding): Promise<string>;
function mockReadFile(_path: string, encoding?: BufferEncoding): Promise<string | Uint8Array> {
	if (encoding !== undefined) {
		return Promise.resolve("");
	}
	return Promise.resolve(new Uint8Array());
}

const nodeRuntime = createNodeRuntime();

describe("CodingAgent SessionManager integration", () => {
	it("constructor auto-restores messages from sessionManager", () => {
		const session = SessionManager.inMemory();
		session.appendMessage(userMsg("hello"));
		session.appendMessage(assistantMsg("hi there"));

		const agent = new CodingAgent({
			model: mockModel,
			runtime: nodeRuntime,
			sessionManager: session,
		});

		expect(agent.messages).toHaveLength(2);
		expect(agent.messages[0]).toEqual(userMsg("hello"));
		expect(agent.messages[1]).toEqual(assistantMsg("hi there"));
		expect(agent.sessionManager).toBe(session);
	});

	it("works without sessionManager", () => {
		const agent = new CodingAgent({ model: mockModel, runtime: nodeRuntime });

		expect(agent.sessionManager).toBeUndefined();
		expect(agent.messages).toHaveLength(0);
	});

	it("uses explicit config.cwd in system prompt", () => {
		const agent = new CodingAgent({ model: mockModel, runtime: nodeRuntime, cwd: "/explicit-cwd" });
		const getSystemPrompt = (
			agent as unknown as {
				getSystemPrompt: () => string;
			}
		).getSystemPrompt;

		const prompt = getSystemPrompt.call(agent);
		expect(prompt).toContain("Current working directory: /explicit-cwd");
	});

	it("uses runtime rootdir as default cwd when config.cwd is not set", () => {
		const runtime: EdgePiRuntime = {
			exec: async () => ({
				output: "",
				exitCode: 0,
				truncated: false,
				timedOut: false,
				aborted: false,
			}),
			resolveWorkspacePath: (targetPath: string, options?: { cwd?: string }) => {
				const base = options?.cwd ?? "/runtime-root";
				return targetPath.startsWith("/") ? targetPath : `${base}/${targetPath}`;
			},
			rootdir: "/runtime-root",
			fs: {
				readFile: mockReadFile,
				writeFile: async () => undefined,
				mkdir: async () => undefined,
				readdir: async () => [],
				stat: async () => ({ isDirectory: () => false, isFile: () => true }),
				access: async () => undefined,
				exists: async () => false,
			},
			path: {
				join: (...parts) => parts.join("/"),
				dirname: () => ".",
				relative: () => ".",
				resolve: (...parts) => parts.join("/"),
				isAbsolute: (pathValue) => pathValue.startsWith("/"),
				basename: () => "",
			},
			os: {
				tmpdir: () => "/tmp",
			},
		};

		const agent = new CodingAgent({ model: mockModel, runtime });
		const getSystemPrompt = (
			agent as unknown as {
				getSystemPrompt: () => string;
			}
		).getSystemPrompt;

		const prompt = getSystemPrompt.call(agent);
		expect(prompt).toContain("Current working directory: /runtime-root");
	});

	it("uses runtime rootdir when cwd is not set", () => {
		const agent = new CodingAgent({ model: mockModel, runtime: nodeRuntime });
		const getSystemPrompt = (
			agent as unknown as {
				getSystemPrompt: () => string;
			}
		).getSystemPrompt;

		const prompt = getSystemPrompt.call(agent);
		expect(prompt).toContain(`Current working directory: ${nodeRuntime.rootdir}`);
	});

	it("sessionManager setter auto-restores messages", () => {
		const agent = new CodingAgent({ model: mockModel, runtime: nodeRuntime });
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
			runtime: nodeRuntime,
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
			runtime: nodeRuntime,
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
			runtime: nodeRuntime,
			sessionManager: session,
		});

		agent.setMessages([userMsg("manual override")]);

		// Agent messages updated
		expect(agent.messages).toHaveLength(1);
		// Session should still be empty (setMessages doesn't persist)
		expect(session.getEntries()).toHaveLength(0);
	});

	it("exposes and updates compaction config at runtime", () => {
		const agent = new CodingAgent({ model: mockModel, runtime: nodeRuntime });

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
		const agent = new CodingAgent({ model: mockModel, runtime: nodeRuntime });

		await expect(agent.compact()).rejects.toThrow("Compaction not configured");
	});

	it("compact() returns undefined when no session manager is attached", async () => {
		const agent = new CodingAgent({
			model: mockModel,
			runtime: nodeRuntime,
			compaction: {
				contextWindow: 200000,
				mode: "manual",
			},
		});

		await expect(agent.compact()).resolves.toBeUndefined();
	});

	it("stream() preserves async-iterable fullStream when wrapping response", async () => {
		const agent = new CodingAgent({ model: mockModel, runtime: nodeRuntime });

		class FakeStreamResult {
			get fullStream(): AsyncIterable<{ type: string; text: string }> {
				return (async function* () {
					yield { type: "text-delta", text: "hello" };
				})();
			}

			get response(): Promise<{ messages: ReturnType<typeof assistantMsg>[] }> {
				return Promise.resolve({
					messages: [assistantMsg("mock response")],
				});
			}
		}

		const fakeAgent = {
			stream: async () => new FakeStreamResult(),
		};

		(agent as unknown as { createAgent: () => { stream: () => Promise<FakeStreamResult> } }).createAgent = () =>
			fakeAgent;

		const result = await agent.stream({ prompt: "hello" });

		const parts: Array<{ type: string; text: string }> = [];
		for await (const part of result.fullStream as AsyncIterable<{ type: string; text: string }>) {
			parts.push(part);
		}

		expect(parts).toHaveLength(1);
		expect(parts[0]).toEqual({ type: "text-delta", text: "hello" });

		const response = await result.response;
		expect(response.messages).toHaveLength(1);
	});
});
