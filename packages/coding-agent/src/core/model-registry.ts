/**
 * Model registry - manages built-in and custom models, provides API key resolution.
 *
 * This module uses Vercel AI SDK providers to create model instances.
 */

import { execSync } from "@mariozechner/pi-env/child-process";
import { existsSync, readFileSync } from "@mariozechner/pi-env/fs";
import { join } from "@mariozechner/pi-env/path";
import { z } from "zod";
import { getAgentDir } from "../config.js";
import type { Api, KnownProvider, ModelInfo } from "./ai-types.js";
import type { AuthStorage } from "./auth-storage.js";
import { getModels, getProviders } from "./models.js";

// ============================================================================
// Zod Schemas for models.json validation
// ============================================================================

const OpenRouterRoutingSchema = z.object({
	only: z.array(z.string()).optional(),
	order: z.array(z.string()).optional(),
});

const VercelGatewayRoutingSchema = z.object({
	only: z.array(z.string()).optional(),
	order: z.array(z.string()).optional(),
});

const OpenAICompletionsCompatSchema = z.object({
	supportsStore: z.boolean().optional(),
	supportsDeveloperRole: z.boolean().optional(),
	supportsReasoningEffort: z.boolean().optional(),
	supportsUsageInStreaming: z.boolean().optional(),
	maxTokensField: z.enum(["max_completion_tokens", "max_tokens"]).optional(),
	requiresToolResultName: z.boolean().optional(),
	requiresAssistantAfterToolResult: z.boolean().optional(),
	requiresThinkingAsText: z.boolean().optional(),
	requiresMistralToolIds: z.boolean().optional(),
	thinkingFormat: z.enum(["openai", "zai", "qwen"]).optional(),
	openRouterRouting: OpenRouterRoutingSchema.optional(),
	vercelGatewayRouting: VercelGatewayRoutingSchema.optional(),
	supportsStrictMode: z.boolean().optional(),
});

const OpenAIResponsesCompatSchema = z.object({
	// Reserved for future use
});

const OpenAICompatSchema = z.union([OpenAICompletionsCompatSchema, OpenAIResponsesCompatSchema]);

const ModelDefinitionSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1).optional(),
	api: z.string().min(1).optional(),
	reasoning: z.boolean().optional(),
	input: z.array(z.enum(["text", "image"])).optional(),
	cost: z
		.object({
			input: z.number(),
			output: z.number(),
			cacheRead: z.number(),
			cacheWrite: z.number(),
		})
		.optional(),
	contextWindow: z.number().optional(),
	maxTokens: z.number().optional(),
	headers: z.record(z.string(), z.string()).optional(),
	compat: OpenAICompatSchema.optional(),
});

const ProviderConfigSchema = z.object({
	baseUrl: z.string().min(1).optional(),
	apiKey: z.string().min(1).optional(),
	api: z.string().min(1).optional(),
	headers: z.record(z.string(), z.string()).optional(),
	authHeader: z.boolean().optional(),
	models: z.array(ModelDefinitionSchema).optional(),
});

const ModelsConfigSchema = z.object({
	providers: z.record(z.string(), ProviderConfigSchema),
});

type ModelsConfig = z.infer<typeof ModelsConfigSchema>;

// ============================================================================
// Types
// ============================================================================

/** Provider override config (baseUrl, headers, apiKey) without custom models */
interface ProviderOverride {
	baseUrl?: string;
	headers?: Record<string, string>;
	apiKey?: string;
}

/** Result of loading custom models from models.json */
interface CustomModelsResult {
	models: ModelInfo<Api>[];
	/** Providers with custom models (full replacement) */
	replacedProviders: Set<string>;
	/** Providers with only baseUrl/headers override (no custom models) */
	overrides: Map<string, ProviderOverride>;
	error: string | undefined;
}

function emptyCustomModelsResult(error?: string): CustomModelsResult {
	return { models: [], replacedProviders: new Set(), overrides: new Map(), error };
}

// ============================================================================
// Config Value Resolution
// ============================================================================

const commandResultCache = new Map<string, string | undefined>();

/**
 * Resolve a config value (API key, header value, etc.) to an actual value.
 * - If starts with "!", executes the rest as a shell command (cached)
 * - Otherwise checks environment variable first, then treats as literal
 */
function resolveConfigValue(config: string): string | undefined {
	if (config.startsWith("!")) {
		return executeCommand(config);
	}
	const envValue = process.env[config];
	return envValue || config;
}

function executeCommand(commandConfig: string): string | undefined {
	if (commandResultCache.has(commandConfig)) {
		return commandResultCache.get(commandConfig);
	}

	const command = commandConfig.slice(1);
	let result: string | undefined;
	try {
		const output = execSync(command, {
			encoding: "utf-8",
			timeout: 10000,
			stdio: ["ignore", "pipe", "ignore"],
		});
		result = output.trim() || undefined;
	} catch {
		result = undefined;
	}

	commandResultCache.set(commandConfig, result);
	return result;
}

/**
 * Resolve all header values using the same resolution logic as API keys.
 */
function resolveHeaders(headers: Record<string, string> | undefined): Record<string, string> | undefined {
	if (!headers) return undefined;
	const resolved: Record<string, string> = {};
	for (const [key, value] of Object.entries(headers)) {
		const resolvedValue = resolveConfigValue(value);
		if (resolvedValue) {
			resolved[key] = resolvedValue;
		}
	}
	return Object.keys(resolved).length > 0 ? resolved : undefined;
}

/** Clear the config value command cache. Exported for testing. */
export function clearApiKeyCache(): void {
	commandResultCache.clear();
}

// ============================================================================
// OAuth Provider Interface
// ============================================================================

import type { OAuthCredentials, OAuthLoginCallbacks } from "./ai-types.js";

/** OAuth credential stored in auth storage */
export interface OAuthCredential {
	type: "oauth";
	refresh: string;
	access: string;
	expires: number;
	[key: string]: unknown;
}

/** OAuth provider interface for /login support */
export interface OAuthProviderInterface {
	readonly id: string;
	readonly name: string;
	/** Whether login uses a local callback server and supports manual code input. */
	usesCallbackServer?: boolean;
	/** Run the login flow, return credentials to persist */
	login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials>;
	/** Refresh expired credentials, return updated credentials to persist */
	refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials>;
	/** Convert credentials to API key string for the provider */
	getApiKey(credentials: OAuthCredentials): string;
	/** Optional: modify models for this provider (e.g., update baseUrl) */
	modifyModels?(models: ModelInfo<Api>[], credentials: OAuthCredentials): ModelInfo<Api>[];
}

// OAuth provider registry
const oauthProviderRegistry = new Map<string, OAuthProviderInterface>();

export function registerOAuthProvider(provider: OAuthProviderInterface): void {
	oauthProviderRegistry.set(provider.id, provider);
}

export function getOAuthProvider(id: string): OAuthProviderInterface | undefined {
	return oauthProviderRegistry.get(id);
}

export function getOAuthProviders(): OAuthProviderInterface[] {
	return Array.from(oauthProviderRegistry.values());
}

// ============================================================================
// Model Registry Class
// ============================================================================

/**
 * Model registry - loads and manages models, resolves API keys via AuthStorage.
 */
export class ModelRegistry {
	private models: ModelInfo<Api>[] = [];
	private customProviderApiKeys: Map<string, string> = new Map();
	private registeredProviders: Map<string, ProviderConfigInput> = new Map();
	private loadError: string | undefined = undefined;

	constructor(
		readonly authStorage: AuthStorage,
		private modelsJsonPath: string | undefined = join(getAgentDir(), "models.json"),
	) {
		// Set up fallback resolver for custom provider API keys
		this.authStorage.setFallbackResolver((provider) => {
			const keyConfig = this.customProviderApiKeys.get(provider);
			if (keyConfig) {
				return resolveConfigValue(keyConfig);
			}
			return undefined;
		});

		// Load models
		this.loadModels();
	}

	/**
	 * Reload models from disk (built-in + custom from models.json).
	 */
	refresh(): void {
		this.customProviderApiKeys.clear();
		this.loadError = undefined;
		this.loadModels();

		for (const [providerName, config] of this.registeredProviders.entries()) {
			this.applyProviderConfig(providerName, config);
		}
	}

	/**
	 * Get any error from loading models.json (undefined if no error).
	 */
	getError(): string | undefined {
		return this.loadError;
	}

	private loadModels(): void {
		// Load custom models from models.json first (to know which providers to skip/override)
		const {
			models: customModels,
			replacedProviders,
			overrides,
			error,
		} = this.modelsJsonPath ? this.loadCustomModels(this.modelsJsonPath) : emptyCustomModelsResult();

		if (error) {
			this.loadError = error;
			// Keep built-in models even if custom models failed to load
		}

		const builtInModels = this.loadBuiltInModels(replacedProviders, overrides);
		let combined = [...builtInModels, ...customModels];

		// Let OAuth providers modify their models (e.g., update baseUrl)
		for (const oauthProvider of getOAuthProviders()) {
			const cred = this.authStorage.get(oauthProvider.id);
			if (cred?.type === "oauth" && oauthProvider.modifyModels) {
				combined = oauthProvider.modifyModels(combined, cred);
			}
		}

		this.models = combined;
	}

	/** Load built-in models, skipping replaced providers and applying overrides */
	private loadBuiltInModels(
		replacedProviders: Set<string>,
		overrides: Map<string, ProviderOverride>,
	): ModelInfo<Api>[] {
		return getProviders()
			.filter((provider) => !replacedProviders.has(provider))
			.flatMap((provider) => {
				const models = getModels(provider as KnownProvider) as ModelInfo<Api>[];
				const override = overrides.get(provider);
				if (!override) return models;

				// Apply baseUrl/headers override to all models of this provider
				const resolvedHeaders = resolveHeaders(override.headers);
				return models.map((m) => ({
					...m,
					baseUrl: override.baseUrl ?? m.baseUrl,
					headers: resolvedHeaders ? { ...m.headers, ...resolvedHeaders } : m.headers,
				}));
			});
	}

	private loadCustomModels(modelsJsonPath: string): CustomModelsResult {
		if (!existsSync(modelsJsonPath)) {
			return emptyCustomModelsResult();
		}

		try {
			const content = readFileSync(modelsJsonPath, "utf-8");
			const rawConfig = JSON.parse(content);

			// Validate schema using Zod
			const result = ModelsConfigSchema.safeParse(rawConfig);
			if (!result.success) {
				const errors =
					result.error.issues.map((e) => `  - /${e.path.join("/") || "root"}: ${e.message}`).join("\n") ||
					"Unknown schema error";
				return emptyCustomModelsResult(`Invalid models.json schema:\n${errors}\n\nFile: ${modelsJsonPath}`);
			}

			const config = result.data;

			// Additional validation
			this.validateConfig(config);

			// Separate providers into "full replacement" (has models) vs "override-only" (no models)
			const replacedProviders = new Set<string>();
			const overrides = new Map<string, ProviderOverride>();

			for (const [providerName, providerConfig] of Object.entries(config.providers)) {
				if (providerConfig.models && providerConfig.models.length > 0) {
					// Has custom models -> full replacement
					replacedProviders.add(providerName);
				} else {
					// No models -> just override baseUrl/headers on built-in
					overrides.set(providerName, {
						baseUrl: providerConfig.baseUrl,
						headers: providerConfig.headers,
						apiKey: providerConfig.apiKey,
					});
					// Store API key for fallback resolver
					if (providerConfig.apiKey) {
						this.customProviderApiKeys.set(providerName, providerConfig.apiKey);
					}
				}
			}

			return { models: this.parseModels(config), replacedProviders, overrides, error: undefined };
		} catch (error) {
			if (error instanceof SyntaxError) {
				return emptyCustomModelsResult(`Failed to parse models.json: ${error.message}\n\nFile: ${modelsJsonPath}`);
			}
			return emptyCustomModelsResult(
				`Failed to load models.json: ${error instanceof Error ? error.message : error}\n\nFile: ${modelsJsonPath}`,
			);
		}
	}

	private validateConfig(config: ModelsConfig): void {
		for (const [providerName, providerConfig] of Object.entries(config.providers)) {
			const hasProviderApi = !!providerConfig.api;
			const models = providerConfig.models ?? [];

			if (models.length === 0) {
				// Override-only config: just needs baseUrl (to override built-in)
				if (!providerConfig.baseUrl) {
					throw new Error(
						`Provider ${providerName}: must specify either "baseUrl" (for override) or "models" (for replacement).`,
					);
				}
			} else {
				// Full replacement: needs baseUrl and apiKey
				if (!providerConfig.baseUrl) {
					throw new Error(`Provider ${providerName}: "baseUrl" is required when defining custom models.`);
				}
				if (!providerConfig.apiKey) {
					throw new Error(`Provider ${providerName}: "apiKey" is required when defining custom models.`);
				}
			}

			for (const modelDef of models) {
				const hasModelApi = !!modelDef.api;

				if (!hasProviderApi && !hasModelApi) {
					throw new Error(
						`Provider ${providerName}, model ${modelDef.id}: no "api" specified. Set at provider or model level.`,
					);
				}

				if (!modelDef.id) throw new Error(`Provider ${providerName}: model missing "id"`);
				// Validate contextWindow/maxTokens only if provided (they have defaults)
				if (modelDef.contextWindow !== undefined && modelDef.contextWindow <= 0)
					throw new Error(`Provider ${providerName}, model ${modelDef.id}: invalid contextWindow`);
				if (modelDef.maxTokens !== undefined && modelDef.maxTokens <= 0)
					throw new Error(`Provider ${providerName}, model ${modelDef.id}: invalid maxTokens`);
			}
		}
	}

	private parseModels(config: ModelsConfig): ModelInfo<Api>[] {
		const models: ModelInfo<Api>[] = [];

		for (const [providerName, providerConfig] of Object.entries(config.providers)) {
			const modelDefs = providerConfig.models ?? [];
			if (modelDefs.length === 0) continue; // Override-only, no custom models

			// Store API key config for fallback resolver
			if (providerConfig.apiKey) {
				this.customProviderApiKeys.set(providerName, providerConfig.apiKey);
			}

			for (const modelDef of modelDefs) {
				const api = modelDef.api || providerConfig.api;
				if (!api) continue;

				// Merge headers: provider headers are base, model headers override
				// Resolve env vars and shell commands in header values
				const providerHeaders = resolveHeaders(providerConfig.headers);
				const modelHeaders = resolveHeaders(modelDef.headers);
				let headers = providerHeaders || modelHeaders ? { ...providerHeaders, ...modelHeaders } : undefined;

				// If authHeader is true, add Authorization header with resolved API key
				if (providerConfig.authHeader && providerConfig.apiKey) {
					const resolvedKey = resolveConfigValue(providerConfig.apiKey);
					if (resolvedKey) {
						headers = { ...headers, Authorization: `Bearer ${resolvedKey}` };
					}
				}

				// baseUrl is validated to exist for providers with models
				// Apply defaults for optional fields
				const defaultCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
				models.push({
					id: modelDef.id,
					name: modelDef.name ?? modelDef.id,
					api: api as Api,
					provider: providerName,
					baseUrl: providerConfig.baseUrl!,
					reasoning: modelDef.reasoning ?? false,
					input: (modelDef.input ?? ["text"]) as ("text" | "image")[],
					cost: modelDef.cost ?? defaultCost,
					contextWindow: modelDef.contextWindow ?? 128000,
					maxTokens: modelDef.maxTokens ?? 16384,
					headers,
					compat: modelDef.compat,
				} as ModelInfo<Api>);
			}
		}

		return models;
	}

	/**
	 * Get all models (built-in + custom).
	 */
	getAll(): ModelInfo<Api>[] {
		return this.models;
	}

	/**
	 * Get only models that have auth configured.
	 */
	getAvailable(): ModelInfo<Api>[] {
		return this.models.filter((m) => this.authStorage.hasAuth(m.provider));
	}

	/**
	 * Find a model by provider and ID.
	 */
	find(provider: string, modelId: string): ModelInfo<Api> | undefined {
		return this.models.find((m) => m.provider === provider && m.id === modelId);
	}

	/**
	 * Get API key for a model.
	 */
	async getApiKey(model: ModelInfo<Api>): Promise<string | undefined> {
		return this.authStorage.getApiKey(model.provider);
	}

	/**
	 * Get API key for a provider.
	 */
	async getApiKeyForProvider(provider: string): Promise<string | undefined> {
		return this.authStorage.getApiKey(provider);
	}

	/**
	 * Check if a model is using OAuth credentials (subscription).
	 */
	isUsingOAuth(model: ModelInfo<Api>): boolean {
		const cred = this.authStorage.get(model.provider);
		return cred?.type === "oauth";
	}

	/**
	 * Register a provider dynamically (from extensions).
	 */
	registerProvider(providerName: string, config: ProviderConfigInput): void {
		this.registeredProviders.set(providerName, config);
		this.applyProviderConfig(providerName, config);
	}

	private applyProviderConfig(providerName: string, config: ProviderConfigInput): void {
		// Register OAuth provider if provided
		if (config.oauth) {
			const oauthProvider: OAuthProviderInterface = {
				...config.oauth,
				id: providerName,
			};
			registerOAuthProvider(oauthProvider);
		}

		// Store API key for auth resolution
		if (config.apiKey) {
			this.customProviderApiKeys.set(providerName, config.apiKey);
		}

		if (config.models && config.models.length > 0) {
			// Full replacement: remove existing models for this provider
			this.models = this.models.filter((m) => m.provider !== providerName);

			// Validate required fields
			if (!config.baseUrl) {
				throw new Error(`Provider ${providerName}: "baseUrl" is required when defining models.`);
			}
			if (!config.apiKey && !config.oauth) {
				throw new Error(`Provider ${providerName}: "apiKey" or "oauth" is required when defining models.`);
			}

			// Parse and add new models
			for (const modelDef of config.models) {
				const api = modelDef.api || config.api;
				if (!api) {
					throw new Error(`Provider ${providerName}, model ${modelDef.id}: no "api" specified.`);
				}

				// Merge headers
				const providerHeaders = resolveHeaders(config.headers);
				const modelHeaders = resolveHeaders(modelDef.headers);
				let headers = providerHeaders || modelHeaders ? { ...providerHeaders, ...modelHeaders } : undefined;

				// If authHeader is true, add Authorization header
				if (config.authHeader && config.apiKey) {
					const resolvedKey = resolveConfigValue(config.apiKey);
					if (resolvedKey) {
						headers = { ...headers, Authorization: `Bearer ${resolvedKey}` };
					}
				}

				this.models.push({
					id: modelDef.id,
					name: modelDef.name,
					api: api as Api,
					provider: providerName,
					baseUrl: config.baseUrl,
					reasoning: modelDef.reasoning,
					input: modelDef.input as ("text" | "image")[],
					cost: modelDef.cost,
					contextWindow: modelDef.contextWindow,
					maxTokens: modelDef.maxTokens,
					headers,
					compat: modelDef.compat,
				} as ModelInfo<Api>);
			}

			// Apply OAuth modifyModels if credentials exist
			if (config.oauth?.modifyModels) {
				const cred = this.authStorage.get(providerName);
				if (cred?.type === "oauth") {
					this.models = config.oauth.modifyModels(this.models, cred);
				}
			}
		} else if (config.baseUrl) {
			// Override-only: update baseUrl/headers for existing models
			const resolvedHeaders = resolveHeaders(config.headers);
			this.models = this.models.map((m) => {
				if (m.provider !== providerName) return m;
				return {
					...m,
					baseUrl: config.baseUrl ?? m.baseUrl,
					headers: resolvedHeaders ? { ...m.headers, ...resolvedHeaders } : m.headers,
				};
			});
		}
	}
}

/**
 * Input type for registerProvider API.
 */
export interface ProviderConfigInput {
	baseUrl?: string;
	apiKey?: string;
	api?: Api;
	headers?: Record<string, string>;
	authHeader?: boolean;
	/** OAuth provider for /login support */
	oauth?: Omit<OAuthProviderInterface, "id">;
	models?: Array<{
		id: string;
		name: string;
		api?: Api;
		reasoning: boolean;
		input: ("text" | "image")[];
		cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
		contextWindow: number;
		maxTokens: number;
		headers?: Record<string, string>;
		compat?: ModelInfo<Api>["compat"];
	}>;
}
