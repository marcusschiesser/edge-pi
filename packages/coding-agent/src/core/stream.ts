/**
 * Streaming utilities using Vercel AI SDK.
 *
 * Provides complete() for non-streaming completions via generateText.
 */

import { generateText } from "ai";
import { convertMessagesToVercelFormat } from "./agent-loop.js";
import type {
	AssistantMessage,
	Context,
	Model,
	SimpleStreamOptions,
	TextContent,
	ThinkingContent,
} from "./ai-types.js";
import { createLanguageModel } from "./model-providers.js";

/**
 * Simple completion using Vercel AI SDK's generateText.
 * Returns an AssistantMessage with the response.
 */
export async function completeSimple(
	model: Model,
	context: Context,
	options?: SimpleStreamOptions,
): Promise<AssistantMessage> {
	const apiKey = options?.apiKey ?? "";
	const languageModel = createLanguageModel(model, apiKey);

	// Convert messages using the shared conversion function
	const messages = context.messages ?? [];
	const vercelMessages = convertMessagesToVercelFormat(messages);

	try {
		const result = await generateText({
			model: languageModel,
			system: context.systemPrompt,
			messages: vercelMessages,
			maxOutputTokens: options?.maxTokens,
			temperature: options?.temperature,
			abortSignal: options?.signal,
		});

		const content: (TextContent | ThinkingContent)[] = [];

		// Add thinking content if present
		if (result.reasoningText) {
			content.push({
				type: "thinking",
				thinking: result.reasoningText,
			});
		}

		// Add text content
		if (result.text) {
			content.push({
				type: "text",
				text: result.text,
			});
		}

		return {
			role: "assistant",
			content,
			api: model.api,
			provider: model.provider,
			model: model.id,
			usage: {
				input: result.usage?.inputTokens ?? 0,
				output: result.usage?.outputTokens ?? 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0),
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: mapFinishReason(result.finishReason),
			timestamp: Date.now(),
		};
	} catch (error) {
		// Handle abort
		if (error instanceof Error && error.name === "AbortError") {
			return {
				role: "assistant",
				content: [],
				api: model.api,
				provider: model.provider,
				model: model.id,
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "aborted",
				timestamp: Date.now(),
			};
		}

		// Handle other errors
		return {
			role: "assistant",
			content: [],
			api: model.api,
			provider: model.provider,
			model: model.id,
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: "error",
			errorMessage: error instanceof Error ? error.message : String(error),
			timestamp: Date.now(),
		};
	}
}

/**
 * Alias for completeSimple for backward compatibility.
 */
export const complete = completeSimple;

/**
 * Map Vercel AI SDK finish reason to our StopReason.
 */
function mapFinishReason(
	reason: "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other" | "unknown",
): "stop" | "length" | "toolUse" | "error" {
	switch (reason) {
		case "stop":
			return "stop";
		case "length":
			return "length";
		case "tool-calls":
			return "toolUse";
		default:
			return "error";
	}
}
