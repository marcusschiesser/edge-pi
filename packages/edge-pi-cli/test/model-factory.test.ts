import { describe, expect, it } from "vitest";
import { detectProvider, getProvider, listProviders } from "../src/model-factory.js";

describe("model-factory", () => {
	describe("listProviders", () => {
		it("should return all supported provider names", () => {
			const providers = listProviders();
			expect(providers).toContain("anthropic");
			expect(providers).toContain("openai");
			expect(providers).toContain("google");
			expect(providers.length).toBe(3);
		});
	});

	describe("getProvider", () => {
		it("should return config for known providers", () => {
			const anthropic = getProvider("anthropic");
			expect(anthropic).toBeDefined();
			expect(anthropic?.name).toBe("anthropic");
			expect(anthropic?.envVar).toBe("ANTHROPIC_API_KEY");
			expect(anthropic?.defaultModel).toBe("claude-opus-4-6");

			const openai = getProvider("openai");
			expect(openai).toBeDefined();
			expect(openai?.name).toBe("openai");
			expect(openai?.defaultModel).toBe("gpt-5.3");

			const google = getProvider("google");
			expect(google).toBeDefined();
			expect(google?.name).toBe("google");
			expect(google?.defaultModel).toBe("gemini-3-flash");
		});

		it("should return undefined for unknown providers", () => {
			expect(getProvider("unknown")).toBeUndefined();
			expect(getProvider("")).toBeUndefined();
		});
	});

	describe("detectProvider", () => {
		it("should return undefined when no env vars are set", () => {
			const saved = {
				ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
				OPENAI_API_KEY: process.env.OPENAI_API_KEY,
				GEMINI_API_KEY: process.env.GEMINI_API_KEY,
				ANTHROPIC_OAUTH_TOKEN: process.env.ANTHROPIC_OAUTH_TOKEN,
			};
			delete process.env.ANTHROPIC_API_KEY;
			delete process.env.OPENAI_API_KEY;
			delete process.env.GEMINI_API_KEY;
			delete process.env.ANTHROPIC_OAUTH_TOKEN;

			try {
				const result = detectProvider();
				expect(result).toBeUndefined();
			} finally {
				for (const [key, value] of Object.entries(saved)) {
					if (value === undefined) {
						delete process.env[key];
					} else {
						process.env[key] = value;
					}
				}
			}
		});

		it("should detect anthropic from env var", () => {
			const saved = process.env.ANTHROPIC_API_KEY;
			process.env.ANTHROPIC_API_KEY = "sk-test";

			try {
				const result = detectProvider();
				expect(result?.name).toBe("anthropic");
			} finally {
				if (saved === undefined) {
					delete process.env.ANTHROPIC_API_KEY;
				} else {
					process.env.ANTHROPIC_API_KEY = saved;
				}
			}
		});

		it("should detect openai from env var", () => {
			const saved = {
				ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
				OPENAI_API_KEY: process.env.OPENAI_API_KEY,
				ANTHROPIC_OAUTH_TOKEN: process.env.ANTHROPIC_OAUTH_TOKEN,
			};
			delete process.env.ANTHROPIC_API_KEY;
			delete process.env.ANTHROPIC_OAUTH_TOKEN;
			process.env.OPENAI_API_KEY = "sk-openai-test";

			try {
				const result = detectProvider();
				expect(result?.name).toBe("openai");
			} finally {
				for (const [key, value] of Object.entries(saved)) {
					if (value === undefined) {
						delete process.env[key];
					} else {
						process.env[key] = value;
					}
				}
			}
		});
	});
});
