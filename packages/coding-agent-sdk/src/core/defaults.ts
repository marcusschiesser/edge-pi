import type { ThinkingLevel } from "./ai-types.js";

export const DEFAULT_THINKING_LEVEL: ThinkingLevel = "medium";

const VALID_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;

export function isValidThinkingLevel(level: string): level is ThinkingLevel {
	return VALID_THINKING_LEVELS.includes(level as ThinkingLevel);
}
