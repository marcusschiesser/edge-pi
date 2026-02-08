/**
 * Model factory - creates Vercel AI SDK LanguageModel instances
 * from provider name + model ID + optional API key.
 *
 * Supports OAuth tokens for Anthropic (Bearer auth with special headers).
 */

import type { LanguageModel } from "ai";
import chalk from "chalk";
import { isAnthropicOAuthToken } from "./auth/anthropic-oauth.js";
import type { AuthStorage } from "./auth/auth-storage.js";

export interface ProviderConfig {
	name: string;
	envVar: string;
	defaultModel: string;
	createModel: (modelId: string, apiKey?: string) => Promise<LanguageModel>;
}

async function createAnthropicModelWithOAuth(modelId: string, apiKey: string): Promise<LanguageModel> {
	const { createAnthropic } = await import("@ai-sdk/anthropic");

	if (isAnthropicOAuthToken(apiKey)) {
		const provider = createAnthropic({
			authToken: apiKey,
			headers: {
				"anthropic-beta": "claude-code-20250219,oauth-2025-04-20",
				"user-agent": "epi/0.1.0 (external, cli)",
			},
		});
		return provider(modelId);
	}

	const provider = createAnthropic({ apiKey });
	return provider(modelId);
}

const providers: Record<string, ProviderConfig> = {
	anthropic: {
		name: "anthropic",
		envVar: "ANTHROPIC_API_KEY",
		defaultModel: "claude-opus-4-6",
		createModel: async (modelId: string, apiKey?: string) => {
			if (apiKey) {
				return createAnthropicModelWithOAuth(modelId, apiKey);
			}
			const { createAnthropic } = await import("@ai-sdk/anthropic");
			const provider = createAnthropic();
			return provider(modelId);
		},
	},
	openai: {
		name: "openai",
		envVar: "OPENAI_API_KEY",
		defaultModel: "gpt-5.3",
		createModel: async (modelId: string, apiKey?: string) => {
			const { createOpenAI } = await import("@ai-sdk/openai");
			const provider = createOpenAI(apiKey ? { apiKey } : undefined);
			return provider(modelId);
		},
	},
	google: {
		name: "google",
		envVar: "GEMINI_API_KEY",
		defaultModel: "gemini-3-flash",
		createModel: async (modelId: string, apiKey?: string) => {
			const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
			const provider = createGoogleGenerativeAI(apiKey ? { apiKey } : undefined);
			return provider(modelId);
		},
	},
};

/**
 * Detect which provider to use based on AuthStorage or environment variables.
 */
export function detectProvider(authStorage?: AuthStorage): ProviderConfig | undefined {
	if (authStorage) {
		for (const config of Object.values(providers)) {
			if (authStorage.hasAuth(config.name)) {
				return config;
			}
		}
	}
	for (const config of Object.values(providers)) {
		if (process.env[config.envVar]) {
			return config;
		}
	}
	return undefined;
}

/**
 * Get a provider config by name.
 */
export function getProvider(name: string): ProviderConfig | undefined {
	return providers[name];
}

/**
 * List all supported provider names.
 */
export function listProviders(): string[] {
	return Object.keys(providers);
}

/**
 * Get the latest recommended models for each provider.
 */
export function getLatestModels(): Record<string, string[]> {
	return {
		anthropic: ["claude-opus-4-6", "claude-sonnet-4-5", "claude-haiku-4-5"],
		openai: ["gpt-5.2-codex", "gpt-5.3-codex"],
		google: ["gemini-3-flash-preview", "gemini-3-pro-preview"],
	};
}

/**
 * Create a LanguageModel from provider name, model ID, and optional API key.
 * Uses AuthStorage for credential resolution (OAuth + API key + env vars).
 */
export async function createModel(options: {
	provider?: string;
	model?: string;
	apiKey?: string;
	authStorage?: AuthStorage;
}): Promise<{
	model: LanguageModel;
	provider: string;
	modelId: string;
}> {
	const { provider: providerName, model: modelId, apiKey, authStorage } = options;

	let config: ProviderConfig | undefined;

	if (providerName) {
		config = getProvider(providerName);
		if (!config) {
			console.error(chalk.red(`Unknown provider: ${providerName}`));
			console.error(`Supported providers: ${listProviders().join(", ")}`);
			process.exit(1);
		}
	} else {
		config = detectProvider(authStorage);
		if (!config) {
			console.error(chalk.red("No API key found. Set one of:"));
			for (const p of Object.values(providers)) {
				console.error(`  ${p.envVar} (for ${p.name})`);
			}
			console.error("Or use: epi /login");
			process.exit(1);
		}
	}

	const resolvedModelId = modelId ?? config.defaultModel;

	// Resolve API key: explicit > AuthStorage > env var
	let resolvedApiKey = apiKey;
	if (!resolvedApiKey && authStorage) {
		resolvedApiKey = await authStorage.getApiKey(config.name);
	}

	try {
		const model = await config.createModel(resolvedModelId, resolvedApiKey);
		return { model, provider: config.name, modelId: resolvedModelId };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.error(chalk.red(`Failed to create model ${config.name}/${resolvedModelId}: ${message}`));
		process.exit(1);
	}
}
