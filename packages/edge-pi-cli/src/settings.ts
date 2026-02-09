/**
 * Settings persistence for edge-pi-cli.
 *
 * Stores user preferences (default provider/model, compaction settings)
 * in ~/.pi/agent/settings.json. Follows the same file-based pattern
 * as auth-storage.ts: load in constructor, save on mutation, create dir if needed.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface CompactionSettings {
	enabled?: boolean;
	reserveTokens?: number;
	keepRecentTokens?: number;
}

export interface SettingsData {
	defaultProvider?: string;
	defaultModel?: string;
	compaction?: CompactionSettings;
}

export class SettingsManager {
	private data: SettingsData = {};

	private constructor(private settingsPath: string) {
		this.reload();
	}

	static create(agentDir: string): SettingsManager {
		const settingsPath = `${agentDir}/settings.json`;
		return new SettingsManager(settingsPath);
	}

	private reload(): void {
		if (!existsSync(this.settingsPath)) {
			this.data = {};
			return;
		}
		try {
			this.data = JSON.parse(readFileSync(this.settingsPath, "utf-8"));
		} catch {
			this.data = {};
		}
	}

	private save(): void {
		const dir = dirname(this.settingsPath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true, mode: 0o700 });
		}
		writeFileSync(this.settingsPath, JSON.stringify(this.data, null, 2), "utf-8");
	}

	getDefaultProvider(): string | undefined {
		return this.data.defaultProvider;
	}

	setDefaultProvider(provider: string): void {
		this.data.defaultProvider = provider;
		this.save();
	}

	getDefaultModel(): string | undefined {
		return this.data.defaultModel;
	}

	setDefaultModel(model: string): void {
		this.data.defaultModel = model;
		this.save();
	}

	getCompaction(): CompactionSettings | undefined {
		return this.data.compaction;
	}

	getCompactionEnabled(): boolean {
		return this.data.compaction?.enabled ?? true;
	}

	setCompactionEnabled(enabled: boolean): void {
		if (!this.data.compaction) {
			this.data.compaction = {};
		}
		this.data.compaction.enabled = enabled;
		this.save();
	}

	setDefaults(provider: string, model: string): void {
		this.data.defaultProvider = provider;
		this.data.defaultModel = model;
		this.save();
	}
}
