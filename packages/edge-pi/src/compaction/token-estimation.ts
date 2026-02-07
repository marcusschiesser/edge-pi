/**
 * Token estimation utilities for ModelMessage[].
 * Uses chars/4 heuristic (conservative, overestimates).
 */

import type { AssistantModelMessage, ModelMessage, ToolModelMessage, UserModelMessage } from "ai";

/**
 * Estimate token count for a single ModelMessage using chars/4 heuristic.
 */
export function estimateTokens(message: ModelMessage): number {
	let chars = 0;

	switch (message.role) {
		case "user": {
			const userMsg = message as UserModelMessage;
			if (typeof userMsg.content === "string") {
				chars = userMsg.content.length;
			} else if (Array.isArray(userMsg.content)) {
				for (const block of userMsg.content) {
					const b = block as any;
					if (b.type === "text" && b.text) {
						chars += b.text.length;
					}
				}
			}
			return Math.ceil(chars / 4);
		}
		case "assistant": {
			const assistantMsg = message as AssistantModelMessage;
			for (const block of assistantMsg.content) {
				const b = block as any;
				if (b.type === "text") {
					chars += b.text.length;
				} else if (b.type === "reasoning") {
					chars += b.text.length;
				} else if (b.type === "tool-call") {
					chars += (b.toolName || "").length + JSON.stringify(b.input || {}).length;
				}
			}
			return Math.ceil(chars / 4);
		}
		case "tool": {
			const toolMsg = message as ToolModelMessage;
			for (const block of toolMsg.content) {
				const b = block as any;
				if (b.type === "tool-result" && b.output !== undefined) {
					if (typeof b.output === "string") {
						chars += b.output.length;
					} else {
						chars += JSON.stringify(b.output).length;
					}
				}
			}
			return Math.ceil(chars / 4);
		}
		case "system": {
			if (typeof message.content === "string") {
				chars = message.content.length;
			} else if (Array.isArray(message.content)) {
				for (const block of message.content as any[]) {
					if (block.type === "text" && block.text) {
						chars += block.text.length;
					}
				}
			}
			return Math.ceil(chars / 4);
		}
	}

	return 0;
}

/**
 * Estimate total tokens in a message array.
 */
export function estimateContextTokens(messages: ModelMessage[]): number {
	let total = 0;
	for (const msg of messages) {
		total += estimateTokens(msg);
	}
	return total;
}

/**
 * Check if compaction should trigger based on context usage.
 */
export function shouldCompact(
	contextTokens: number,
	contextWindow: number,
	settings: { enabled: boolean; reserveTokens: number },
): boolean {
	if (!settings.enabled) return false;
	return contextTokens > contextWindow - settings.reserveTokens;
}
