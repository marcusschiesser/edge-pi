import { describe, expect, it } from "vitest";
import { buildProviderOptions } from "../src/provider-options.js";

describe("buildProviderOptions", () => {
	it("returns codex options for openai-codex provider", () => {
		const result = buildProviderOptions("openai-codex");

		expect(result).toEqual({
			openai: {
				instructions: "Follow all system and developer messages for task and tool behavior.",
				store: false,
			},
		});
	});

	it("returns anthropic thinking options when thinking is enabled", () => {
		const result = buildProviderOptions("anthropic", "medium");

		expect(result).toEqual({
			anthropic: {
				thinking: {
					type: "enabled",
					budgetTokens: 10240,
				},
			},
		});
	});

	it("returns both codex and anthropic options when applicable", () => {
		const result = buildProviderOptions("openai-codex", "low");

		expect(result).toEqual({
			openai: {
				instructions: "Follow all system and developer messages for task and tool behavior.",
				store: false,
			},
			anthropic: {
				thinking: {
					type: "enabled",
					budgetTokens: 4096,
				},
			},
		});
	});

	it("returns undefined when no provider options are needed", () => {
		expect(buildProviderOptions("openai")).toBeUndefined();
		expect(buildProviderOptions("openai", "off")).toBeUndefined();
	});
});
