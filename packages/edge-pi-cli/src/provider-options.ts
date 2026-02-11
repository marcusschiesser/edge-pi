import type { CodingAgentConfig } from "edge-pi";

const OPENAI_CODEX_INSTRUCTIONS_BRIDGE = "Follow all system and developer messages for task and tool behavior.";

const THINKING_BUDGET_MAP: Record<string, number> = {
	minimal: 1024,
	low: 4096,
	medium: 10240,
	high: 32768,
};

export function buildProviderOptions(provider: string, thinking?: string): CodingAgentConfig["providerOptions"] {
	const providerOptions: NonNullable<CodingAgentConfig["providerOptions"]> = {};

	if (provider === "openai-codex") {
		providerOptions.openai = {
			instructions: OPENAI_CODEX_INSTRUCTIONS_BRIDGE,
			store: false,
		};
	}

	if (thinking && thinking !== "off") {
		const budgetTokens = THINKING_BUDGET_MAP[thinking];
		if (budgetTokens) {
			providerOptions.anthropic = {
				...(providerOptions.anthropic ?? {}),
				thinking: { type: "enabled", budgetTokens },
			};
		}
	}

	return Object.keys(providerOptions).length > 0 ? providerOptions : undefined;
}
