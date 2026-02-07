import { describe, expect, it } from "vitest";
import { anthropicOAuthProvider, isAnthropicOAuthToken } from "../src/auth/anthropic-oauth.js";

describe("isAnthropicOAuthToken", () => {
	it("should return true for tokens containing sk-ant-oat", () => {
		expect(isAnthropicOAuthToken("sk-ant-oat-abc123")).toBe(true);
		expect(isAnthropicOAuthToken("prefix-sk-ant-oat-suffix")).toBe(true);
	});

	it("should return false for regular API keys", () => {
		expect(isAnthropicOAuthToken("sk-ant-api01-abc123")).toBe(false);
		expect(isAnthropicOAuthToken("sk-test-key")).toBe(false);
		expect(isAnthropicOAuthToken("")).toBe(false);
	});

	it("should return false for OpenAI-style keys", () => {
		expect(isAnthropicOAuthToken("sk-proj-abc123")).toBe(false);
	});
});

describe("anthropicOAuthProvider", () => {
	it("should have correct id and name", () => {
		expect(anthropicOAuthProvider.id).toBe("anthropic");
		expect(anthropicOAuthProvider.name).toBe("Anthropic (Claude Pro/Max)");
	});

	it("should extract access token via getApiKey", () => {
		const cred = {
			refresh: "refresh-token",
			access: "sk-ant-oat-access-token",
			expires: Date.now() + 3600_000,
		};
		expect(anthropicOAuthProvider.getApiKey(cred)).toBe("sk-ant-oat-access-token");
	});

	it("should have login and refreshToken methods", () => {
		expect(typeof anthropicOAuthProvider.login).toBe("function");
		expect(typeof anthropicOAuthProvider.refreshToken).toBe("function");
	});
});
