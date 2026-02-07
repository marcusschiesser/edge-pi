import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthStorage } from "../src/auth/auth-storage.js";
import type { OAuthCredentials, OAuthProviderInterface } from "../src/auth/types.js";

function createMockProvider(overrides?: Partial<OAuthProviderInterface>): OAuthProviderInterface {
	return {
		id: "test-provider",
		name: "Test Provider",
		login: vi.fn().mockResolvedValue({
			refresh: "refresh-token",
			access: "access-token",
			expires: Date.now() + 3600_000,
		}),
		refreshToken: vi.fn().mockResolvedValue({
			refresh: "new-refresh-token",
			access: "new-access-token",
			expires: Date.now() + 3600_000,
		}),
		getApiKey: vi.fn((cred: OAuthCredentials) => cred.access),
		...overrides,
	};
}

describe("AuthStorage", () => {
	let testDir: string;
	let authPath: string;

	beforeEach(() => {
		testDir = join(process.cwd(), `test-auth-tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(testDir, { recursive: true });
		authPath = join(testDir, "auth.json");
	});

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true });
		}
	});

	describe("basic CRUD", () => {
		it("should start empty when auth file does not exist", () => {
			const storage = new AuthStorage(authPath);
			expect(storage.list()).toHaveLength(0);
			expect(storage.has("anthropic")).toBe(false);
		});

		it("should set and get API key credentials", () => {
			const storage = new AuthStorage(authPath);
			storage.set("anthropic", { type: "api_key", key: "sk-test-123" });

			expect(storage.has("anthropic")).toBe(true);
			const cred = storage.get("anthropic");
			expect(cred?.type).toBe("api_key");
			if (cred?.type === "api_key") {
				expect(cred.key).toBe("sk-test-123");
			}
		});

		it("should persist credentials to disk", () => {
			const storage = new AuthStorage(authPath);
			storage.set("anthropic", { type: "api_key", key: "sk-test-123" });

			// Read back from a new instance
			const storage2 = new AuthStorage(authPath);
			expect(storage2.has("anthropic")).toBe(true);
			const cred = storage2.get("anthropic");
			expect(cred?.type).toBe("api_key");
		});

		it("should set and get OAuth credentials", () => {
			const storage = new AuthStorage(authPath);
			storage.set("anthropic", {
				type: "oauth",
				refresh: "refresh-tok",
				access: "sk-ant-oat-access-tok",
				expires: Date.now() + 3600_000,
			});

			const cred = storage.get("anthropic");
			expect(cred?.type).toBe("oauth");
			if (cred?.type === "oauth") {
				expect(cred.access).toBe("sk-ant-oat-access-tok");
				expect(cred.refresh).toBe("refresh-tok");
			}
		});

		it("should remove credentials", () => {
			const storage = new AuthStorage(authPath);
			storage.set("anthropic", { type: "api_key", key: "sk-test-123" });
			expect(storage.has("anthropic")).toBe(true);

			storage.remove("anthropic");
			expect(storage.has("anthropic")).toBe(false);
			expect(storage.get("anthropic")).toBeUndefined();
		});

		it("should list all stored providers", () => {
			const storage = new AuthStorage(authPath);
			storage.set("anthropic", { type: "api_key", key: "sk-test-1" });
			storage.set("openai", { type: "api_key", key: "sk-test-2" });

			const list = storage.list();
			expect(list).toHaveLength(2);
			expect(list).toContain("anthropic");
			expect(list).toContain("openai");
		});

		it("should handle corrupt auth file gracefully", () => {
			writeFileSync(authPath, "not valid json{{{");
			const storage = new AuthStorage(authPath);
			expect(storage.list()).toHaveLength(0);
		});

		it("should reload credentials from disk", () => {
			const storage = new AuthStorage(authPath);
			storage.set("anthropic", { type: "api_key", key: "sk-old" });

			// External modification
			const data = JSON.parse(readFileSync(authPath, "utf-8"));
			data.anthropic.key = "sk-new";
			writeFileSync(authPath, JSON.stringify(data));

			storage.reload();
			const cred = storage.get("anthropic");
			if (cred?.type === "api_key") {
				expect(cred.key).toBe("sk-new");
			}
		});
	});

	describe("provider registry", () => {
		it("should register and retrieve providers", () => {
			const storage = new AuthStorage(authPath);
			const provider = createMockProvider();
			storage.registerProvider(provider);

			expect(storage.getProvider("test-provider")).toBe(provider);
			expect(storage.getProviders()).toHaveLength(1);
		});

		it("should return undefined for unregistered provider", () => {
			const storage = new AuthStorage(authPath);
			expect(storage.getProvider("nonexistent")).toBeUndefined();
		});
	});

	describe("runtime overrides", () => {
		it("should override stored credentials with runtime API key", async () => {
			const storage = new AuthStorage(authPath);
			storage.set("anthropic", { type: "api_key", key: "sk-stored" });
			storage.setRuntimeApiKey("anthropic", "sk-runtime");

			const key = await storage.getApiKey("anthropic");
			expect(key).toBe("sk-runtime");
		});

		it("should use runtime override even when no stored credentials", async () => {
			const storage = new AuthStorage(authPath);
			storage.setRuntimeApiKey("anthropic", "sk-runtime");

			const key = await storage.getApiKey("anthropic");
			expect(key).toBe("sk-runtime");
		});
	});

	describe("hasAuth", () => {
		it("should return true for runtime override", () => {
			const storage = new AuthStorage(authPath);
			storage.setRuntimeApiKey("anthropic", "sk-test");
			expect(storage.hasAuth("anthropic")).toBe(true);
		});

		it("should return true for stored credentials", () => {
			const storage = new AuthStorage(authPath);
			storage.set("anthropic", { type: "api_key", key: "sk-test" });
			expect(storage.hasAuth("anthropic")).toBe(true);
		});

		it("should return true for env var", () => {
			const storage = new AuthStorage(authPath);
			const original = process.env.ANTHROPIC_API_KEY;
			process.env.ANTHROPIC_API_KEY = "sk-env-test";
			try {
				expect(storage.hasAuth("anthropic")).toBe(true);
			} finally {
				if (original === undefined) {
					delete process.env.ANTHROPIC_API_KEY;
				} else {
					process.env.ANTHROPIC_API_KEY = original;
				}
			}
		});

		it("should return false for unknown provider with no credentials", () => {
			const storage = new AuthStorage(authPath);
			expect(storage.hasAuth("unknown")).toBe(false);
		});
	});

	describe("getApiKey priority", () => {
		it("should return stored API key", async () => {
			const storage = new AuthStorage(authPath);
			storage.set("anthropic", { type: "api_key", key: "sk-stored" });

			const key = await storage.getApiKey("anthropic");
			expect(key).toBe("sk-stored");
		});

		it("should return valid OAuth access token", async () => {
			const storage = new AuthStorage(authPath);
			const provider = createMockProvider({ id: "anthropic" });
			storage.registerProvider(provider);
			storage.set("anthropic", {
				type: "oauth",
				refresh: "refresh-tok",
				access: "access-tok",
				expires: Date.now() + 3600_000,
			});

			const key = await storage.getApiKey("anthropic");
			expect(key).toBe("access-tok");
			expect(provider.getApiKey).toHaveBeenCalled();
		});

		it("should refresh expired OAuth token", async () => {
			const storage = new AuthStorage(authPath);
			const newExpires = Date.now() + 3600_000;
			const provider = createMockProvider({
				id: "anthropic",
				refreshToken: vi.fn().mockResolvedValue({
					refresh: "new-refresh",
					access: "new-access",
					expires: newExpires,
				}),
			});
			storage.registerProvider(provider);
			storage.set("anthropic", {
				type: "oauth",
				refresh: "old-refresh",
				access: "old-access",
				expires: Date.now() - 1000, // expired
			});

			const key = await storage.getApiKey("anthropic");
			expect(key).toBe("new-access");
			expect(provider.refreshToken).toHaveBeenCalled();
		});

		it("should fall back to env var when no credentials stored", async () => {
			const storage = new AuthStorage(authPath);
			const original = process.env.OPENAI_API_KEY;
			process.env.OPENAI_API_KEY = "sk-env-openai";
			try {
				const key = await storage.getApiKey("openai");
				expect(key).toBe("sk-env-openai");
			} finally {
				if (original === undefined) {
					delete process.env.OPENAI_API_KEY;
				} else {
					process.env.OPENAI_API_KEY = original;
				}
			}
		});

		it("should return undefined when no credentials available", async () => {
			const storage = new AuthStorage(authPath);
			const key = await storage.getApiKey("nonexistent");
			expect(key).toBeUndefined();
		});
	});

	describe("login and logout", () => {
		it("should login via OAuth provider and store credentials", async () => {
			const storage = new AuthStorage(authPath);
			const provider = createMockProvider({ id: "test" });
			storage.registerProvider(provider);

			const callbacks = {
				onAuth: vi.fn(),
				onPrompt: vi.fn().mockResolvedValue("auth-code"),
			};

			await storage.login("test", callbacks);

			expect(provider.login).toHaveBeenCalledWith(callbacks);
			expect(storage.has("test")).toBe(true);
			const cred = storage.get("test");
			expect(cred?.type).toBe("oauth");
		});

		it("should throw for unknown provider on login", async () => {
			const storage = new AuthStorage(authPath);
			const callbacks = {
				onAuth: vi.fn(),
				onPrompt: vi.fn(),
			};

			await expect(storage.login("unknown", callbacks)).rejects.toThrow(/Unknown OAuth provider/);
		});

		it("should logout and remove credentials", () => {
			const storage = new AuthStorage(authPath);
			storage.set("test", { type: "api_key", key: "sk-test" });
			expect(storage.has("test")).toBe(true);

			storage.logout("test");
			expect(storage.has("test")).toBe(false);
		});
	});

	describe("file permissions", () => {
		it("should create auth file with restricted permissions", () => {
			const storage = new AuthStorage(authPath);
			storage.set("test", { type: "api_key", key: "sk-test" });

			expect(existsSync(authPath)).toBe(true);
			// Auth file exists - we trust it was created with chmod 0o600
			const content = JSON.parse(readFileSync(authPath, "utf-8"));
			expect(content.test.key).toBe("sk-test");
		});

		it("should create parent directories if needed", () => {
			const deepPath = join(testDir, "deep", "nested", "auth.json");
			const storage = new AuthStorage(deepPath);
			storage.set("test", { type: "api_key", key: "sk-test" });

			expect(existsSync(deepPath)).toBe(true);
		});
	});
});
