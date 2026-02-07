import type { AssistantModelMessage, ModelMessage, UserModelMessage } from "ai";
import { describe, expect, it } from "vitest";
import {
	computeFileLists,
	createFileOps,
	extractFileOpsFromModelMessage,
	formatFileOperations,
	serializeModelMessages,
} from "../src/compaction/utils.js";

describe("File operation tracking", () => {
	describe("createFileOps", () => {
		it("creates empty file operations", () => {
			const ops = createFileOps();
			expect(ops.read.size).toBe(0);
			expect(ops.written.size).toBe(0);
			expect(ops.edited.size).toBe(0);
		});
	});

	describe("extractFileOpsFromModelMessage", () => {
		it("extracts read operations from tool calls", () => {
			const msg: AssistantModelMessage = {
				role: "assistant",
				content: [
					{
						type: "tool-call",
						toolCallId: "tc1",
						toolName: "read",
						input: { path: "/src/file.ts" },
					},
				],
			};

			const ops = createFileOps();
			extractFileOpsFromModelMessage(msg, ops);
			expect(ops.read.has("/src/file.ts")).toBe(true);
		});

		it("extracts write operations", () => {
			const msg: AssistantModelMessage = {
				role: "assistant",
				content: [
					{
						type: "tool-call",
						toolCallId: "tc1",
						toolName: "write",
						input: { path: "/src/new.ts", content: "hello" },
					},
				],
			};

			const ops = createFileOps();
			extractFileOpsFromModelMessage(msg, ops);
			expect(ops.written.has("/src/new.ts")).toBe(true);
		});

		it("extracts edit operations", () => {
			const msg: AssistantModelMessage = {
				role: "assistant",
				content: [
					{
						type: "tool-call",
						toolCallId: "tc1",
						toolName: "edit",
						input: { path: "/src/edit.ts", old_text: "a", new_text: "b" },
					},
				],
			};

			const ops = createFileOps();
			extractFileOpsFromModelMessage(msg, ops);
			expect(ops.edited.has("/src/edit.ts")).toBe(true);
		});

		it("ignores non-assistant messages", () => {
			const msg: UserModelMessage = {
				role: "user",
				content: [{ type: "text", text: "hello" }],
			};

			const ops = createFileOps();
			extractFileOpsFromModelMessage(msg, ops);
			expect(ops.read.size).toBe(0);
			expect(ops.written.size).toBe(0);
			expect(ops.edited.size).toBe(0);
		});

		it("ignores tool calls without path", () => {
			const msg: AssistantModelMessage = {
				role: "assistant",
				content: [
					{
						type: "tool-call",
						toolCallId: "tc1",
						toolName: "bash",
						input: { command: "echo hello" },
					},
				],
			};

			const ops = createFileOps();
			extractFileOpsFromModelMessage(msg, ops);
			expect(ops.read.size).toBe(0);
		});
	});

	describe("computeFileLists", () => {
		it("separates read-only and modified files", () => {
			const ops = createFileOps();
			ops.read.add("/a.ts");
			ops.read.add("/b.ts");
			ops.edited.add("/b.ts");
			ops.written.add("/c.ts");

			const { readFiles, modifiedFiles } = computeFileLists(ops);
			expect(readFiles).toEqual(["/a.ts"]); // only read, not modified
			expect(modifiedFiles).toEqual(["/b.ts", "/c.ts"]); // sorted
		});

		it("returns empty arrays for empty operations", () => {
			const ops = createFileOps();
			const { readFiles, modifiedFiles } = computeFileLists(ops);
			expect(readFiles).toEqual([]);
			expect(modifiedFiles).toEqual([]);
		});
	});

	describe("formatFileOperations", () => {
		it("formats both read and modified files", () => {
			const result = formatFileOperations(["/a.ts"], ["/b.ts"]);
			expect(result).toContain("<read-files>");
			expect(result).toContain("/a.ts");
			expect(result).toContain("<modified-files>");
			expect(result).toContain("/b.ts");
		});

		it("returns empty string when no files", () => {
			expect(formatFileOperations([], [])).toBe("");
		});

		it("only includes sections with files", () => {
			const result = formatFileOperations([], ["/b.ts"]);
			expect(result).not.toContain("<read-files>");
			expect(result).toContain("<modified-files>");
		});
	});
});

describe("serializeModelMessages", () => {
	it("serializes user message", () => {
		const messages: ModelMessage[] = [{ role: "user", content: [{ type: "text", text: "hello world" }] }];
		const result = serializeModelMessages(messages);
		expect(result).toContain("[User]: hello world");
	});

	it("serializes assistant message with text", () => {
		const messages: ModelMessage[] = [
			{ role: "assistant", content: [{ type: "text", text: "here is my response" }] },
		];
		const result = serializeModelMessages(messages);
		expect(result).toContain("[Assistant]: here is my response");
	});

	it("serializes assistant message with tool calls", () => {
		const messages: ModelMessage[] = [
			{
				role: "assistant",
				content: [
					{
						type: "tool-call",
						toolCallId: "tc1",
						toolName: "read",
						input: { path: "/src/file.ts" },
					},
				],
			},
		];
		const result = serializeModelMessages(messages);
		expect(result).toContain("[Assistant tool calls]:");
		expect(result).toContain("read(");
		expect(result).toContain("/src/file.ts");
	});

	it("serializes tool result message", () => {
		const messages: ModelMessage[] = [
			{
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolCallId: "tc1",
						toolName: "read",
						output: "file contents here" as any,
					},
				],
			},
		];
		const result = serializeModelMessages(messages);
		expect(result).toContain("[Tool result]: file contents here");
	});

	it("serializes full conversation", () => {
		const messages: ModelMessage[] = [
			{ role: "user", content: [{ type: "text", text: "Read the file" }] },
			{
				role: "assistant",
				content: [
					{
						type: "tool-call",
						toolCallId: "tc1",
						toolName: "read",
						input: { path: "/x.ts" },
					},
				],
			},
			{
				role: "tool",
				content: [
					{
						type: "tool-result",
						toolCallId: "tc1",
						toolName: "read",
						output: "const x = 1;" as any,
					},
				],
			},
			{ role: "assistant", content: [{ type: "text", text: "Here is the content." }] },
		];
		const result = serializeModelMessages(messages);
		expect(result).toContain("[User]:");
		expect(result).toContain("[Assistant tool calls]:");
		expect(result).toContain("[Tool result]:");
		expect(result).toContain("[Assistant]:");
	});

	it("returns empty string for empty array", () => {
		expect(serializeModelMessages([])).toBe("");
	});
});
