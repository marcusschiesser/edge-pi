/**
 * Shared utilities for compaction and branch summarization.
 */

import type { AssistantModelMessage, ModelMessage, ToolModelMessage, UserModelMessage } from "ai";

// ============================================================================
// File Operation Tracking
// ============================================================================

export interface FileOperations {
	read: Set<string>;
	written: Set<string>;
	edited: Set<string>;
}

export function createFileOps(): FileOperations {
	return {
		read: new Set(),
		written: new Set(),
		edited: new Set(),
	};
}

/**
 * Extract file operations from tool calls in an assistant message.
 * Scans the ModelMessage content for tool-call parts.
 */
export function extractFileOpsFromModelMessage(message: ModelMessage, fileOps: FileOperations): void {
	if (message.role !== "assistant") return;
	const assistantMsg = message as AssistantModelMessage;
	if (!Array.isArray(assistantMsg.content)) return;

	for (const block of assistantMsg.content) {
		if (typeof block !== "object" || block === null) continue;
		if (!("type" in block) || block.type !== "tool-call") continue;

		const toolCallBlock = block as { type: "tool-call"; toolName: string; input: unknown };
		const input = toolCallBlock.input as Record<string, unknown> | undefined;
		if (!input) continue;

		const path = typeof input.path === "string" ? input.path : undefined;
		if (!path) continue;

		switch (toolCallBlock.toolName) {
			case "read":
				fileOps.read.add(path);
				break;
			case "write":
				fileOps.written.add(path);
				break;
			case "edit":
				fileOps.edited.add(path);
				break;
		}
	}
}

/**
 * Compute final file lists from file operations.
 * Returns readFiles (files only read, not modified) and modifiedFiles.
 */
export function computeFileLists(fileOps: FileOperations): { readFiles: string[]; modifiedFiles: string[] } {
	const modified = new Set([...fileOps.edited, ...fileOps.written]);
	const readOnly = [...fileOps.read].filter((f) => !modified.has(f)).sort();
	const modifiedFiles = [...modified].sort();
	return { readFiles: readOnly, modifiedFiles };
}

/**
 * Format file operations as XML tags for summary.
 */
export function formatFileOperations(readFiles: string[], modifiedFiles: string[]): string {
	const sections: string[] = [];
	if (readFiles.length > 0) {
		sections.push(`<read-files>\n${readFiles.join("\n")}\n</read-files>`);
	}
	if (modifiedFiles.length > 0) {
		sections.push(`<modified-files>\n${modifiedFiles.join("\n")}\n</modified-files>`);
	}
	if (sections.length === 0) return "";
	return `\n\n${sections.join("\n\n")}`;
}

// ============================================================================
// Message Serialization
// ============================================================================

/**
 * Serialize ModelMessage[] to text for summarization.
 * This prevents the model from treating it as a conversation to continue.
 */
export function serializeModelMessages(messages: ModelMessage[]): string {
	const parts: string[] = [];

	for (const msg of messages) {
		switch (msg.role) {
			case "user": {
				const userMsg = msg as UserModelMessage;
				const content =
					typeof userMsg.content === "string"
						? userMsg.content
						: userMsg.content
								.filter((c): c is { type: "text"; text: string } => (c as any).type === "text")
								.map((c) => c.text)
								.join("");
				if (content) parts.push(`[User]: ${content}`);
				break;
			}
			case "assistant": {
				const assistantMsg = msg as AssistantModelMessage;
				const textParts: string[] = [];
				const thinkingParts: string[] = [];
				const toolCalls: string[] = [];

				for (const block of assistantMsg.content) {
					const b = block as any;
					if (b.type === "text") {
						textParts.push(b.text);
					} else if (b.type === "reasoning") {
						thinkingParts.push(b.text);
					} else if (b.type === "tool-call") {
						const input = (b.input || {}) as Record<string, unknown>;
						const argsStr = Object.entries(input)
							.map(([k, v]) => `${k}=${JSON.stringify(v)}`)
							.join(", ");
						toolCalls.push(`${b.toolName}(${argsStr})`);
					}
				}

				if (thinkingParts.length > 0) {
					parts.push(`[Assistant thinking]: ${thinkingParts.join("\n")}`);
				}
				if (textParts.length > 0) {
					parts.push(`[Assistant]: ${textParts.join("\n")}`);
				}
				if (toolCalls.length > 0) {
					parts.push(`[Assistant tool calls]: ${toolCalls.join("; ")}`);
				}
				break;
			}
			case "tool": {
				const toolMsg = msg as ToolModelMessage;
				const toolResults: string[] = [];
				for (const block of toolMsg.content) {
					const b = block as any;
					if (b.type === "tool-result") {
						const output = b.output;
						if (typeof output === "string") {
							toolResults.push(output);
						} else if (output !== undefined && output !== null) {
							toolResults.push(JSON.stringify(output));
						}
					}
				}
				if (toolResults.length > 0) {
					parts.push(`[Tool result]: ${toolResults.join("\n")}`);
				}
				break;
			}
		}
	}

	return parts.join("\n\n");
}

// ============================================================================
// Summarization System Prompt
// ============================================================================

export const SUMMARIZATION_SYSTEM_PROMPT = `You are a context summarization assistant. Your task is to read a conversation between a user and an AI coding assistant, then produce a structured summary following the exact format specified.

Do NOT continue the conversation. Do NOT respond to any questions in the conversation. ONLY output the structured summary.`;
