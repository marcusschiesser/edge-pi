/**
 * Credential storage backed by auth.json.
 * Handles API keys and OAuth tokens with file-locked token refresh.
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import lockfile from "proper-lockfile";
import type {
	AuthCredential,
	AuthStorageData,
	OAuthCredentials,
	OAuthLoginCallbacks,
	OAuthProviderInterface,
} from "./types.js";

const ENV_KEY_MAP: Record<string, string> = {
	anthropic: "ANTHROPIC_API_KEY",
	openai: "OPENAI_API_KEY",
	google: "GEMINI_API_KEY",
};

function getEnvApiKey(provider: string): string | undefined {
	// Anthropic: ANTHROPIC_OAUTH_TOKEN takes precedence
	if (provider === "anthropic") {
		return process.env.ANTHROPIC_OAUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
	}
	// GitHub Copilot: check multiple env vars
	if (provider === "github-copilot") {
		return process.env.COPILOT_GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
	}
	const envVar = ENV_KEY_MAP[provider];
	return envVar ? process.env[envVar] : undefined;
}

export class AuthStorage {
	private data: AuthStorageData = {};
	private runtimeOverrides: Map<string, string> = new Map();
	private providers: Map<string, OAuthProviderInterface> = new Map();

	constructor(private authPath: string) {
		this.reload();
	}

	/** Register an OAuth provider. */
	registerProvider(provider: OAuthProviderInterface): void {
		this.providers.set(provider.id, provider);
	}

	/** Get a registered OAuth provider. */
	getProvider(id: string): OAuthProviderInterface | undefined {
		return this.providers.get(id);
	}

	/** Get all registered OAuth providers. */
	getProviders(): OAuthProviderInterface[] {
		return Array.from(this.providers.values());
	}

	/** Set a runtime API key override (not persisted). Used for --api-key flag. */
	setRuntimeApiKey(provider: string, apiKey: string): void {
		this.runtimeOverrides.set(provider, apiKey);
	}

	/** Reload credentials from disk. */
	reload(): void {
		if (!existsSync(this.authPath)) {
			this.data = {};
			return;
		}
		try {
			this.data = JSON.parse(readFileSync(this.authPath, "utf-8"));
		} catch {
			this.data = {};
		}
	}

	private save(): void {
		const dir = dirname(this.authPath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true, mode: 0o700 });
		}
		writeFileSync(this.authPath, JSON.stringify(this.data, null, 2), "utf-8");
		chmodSync(this.authPath, 0o600);
	}

	/** Get credential for a provider. */
	get(provider: string): AuthCredential | undefined {
		return this.data[provider] ?? undefined;
	}

	/** Set credential for a provider. */
	set(provider: string, credential: AuthCredential): void {
		this.data[provider] = credential;
		this.save();
	}

	/** Remove credential for a provider. */
	remove(provider: string): void {
		delete this.data[provider];
		this.save();
	}

	/** List all providers with stored credentials. */
	list(): string[] {
		return Object.keys(this.data);
	}

	/** Check if a provider has stored credentials. */
	has(provider: string): boolean {
		return provider in this.data;
	}

	/** Check if any auth is available for a provider. */
	hasAuth(provider: string): boolean {
		if (this.runtimeOverrides.has(provider)) return true;
		if (this.data[provider]) return true;
		if (getEnvApiKey(provider)) return true;
		return false;
	}

	/** Login to an OAuth provider. */
	async login(providerId: string, callbacks: OAuthLoginCallbacks): Promise<void> {
		const provider = this.providers.get(providerId);
		if (!provider) {
			throw new Error(`Unknown OAuth provider: ${providerId}`);
		}
		const credentials = await provider.login(callbacks);
		this.set(providerId, { type: "oauth", ...credentials });
	}

	/** Logout from a provider. */
	logout(provider: string): void {
		this.remove(provider);
	}

	/**
	 * Refresh an OAuth token with file locking to prevent race conditions.
	 */
	private async refreshOAuthTokenWithLock(
		providerId: string,
	): Promise<{ apiKey: string; newCredentials: OAuthCredentials } | null> {
		const provider = this.providers.get(providerId);
		if (!provider) return null;

		// Ensure auth file exists for locking
		if (!existsSync(this.authPath)) {
			const dir = dirname(this.authPath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true, mode: 0o700 });
			}
			writeFileSync(this.authPath, "{}", "utf-8");
			chmodSync(this.authPath, 0o600);
		}

		let release: (() => Promise<void>) | undefined;

		try {
			release = await lockfile.lock(this.authPath, {
				retries: {
					retries: 10,
					factor: 2,
					minTimeout: 100,
					maxTimeout: 10000,
					randomize: true,
				},
				stale: 30000,
			});

			// Re-read after acquiring lock - another instance may have refreshed
			this.reload();

			const cred = this.data[providerId];
			if (cred?.type !== "oauth") return null;

			// Check if still expired (another instance may have refreshed)
			if (Date.now() < cred.expires) {
				const apiKey = provider.getApiKey(cred);
				return { apiKey, newCredentials: cred };
			}

			// Refresh the token
			const newCredentials = await provider.refreshToken(cred);
			this.data[providerId] = { type: "oauth", ...newCredentials };
			this.save();

			return { apiKey: provider.getApiKey(newCredentials), newCredentials };
		} finally {
			if (release) {
				try {
					await release();
				} catch {
					// Ignore unlock errors
				}
			}
		}
	}

	/**
	 * Get API key for a provider.
	 * Priority: runtime override → auth.json API key → OAuth (auto-refresh) → env var
	 */
	async getApiKey(providerId: string): Promise<string | undefined> {
		// Runtime override
		const runtimeKey = this.runtimeOverrides.get(providerId);
		if (runtimeKey) return runtimeKey;

		const cred = this.data[providerId];

		// Stored API key
		if (cred?.type === "api_key") return cred.key;

		// OAuth token with auto-refresh
		if (cred?.type === "oauth") {
			const provider = this.providers.get(providerId);
			if (!provider) return undefined;

			if (Date.now() >= cred.expires) {
				try {
					const result = await this.refreshOAuthTokenWithLock(providerId);
					if (result) return result.apiKey;
				} catch {
					// Re-read to check if another instance succeeded
					this.reload();
					const updated = this.data[providerId];
					if (updated?.type === "oauth" && Date.now() < updated.expires) {
						return provider.getApiKey(updated);
					}
					return undefined;
				}
			} else {
				return provider.getApiKey(cred);
			}
		}

		// Environment variable
		return getEnvApiKey(providerId);
	}
}
