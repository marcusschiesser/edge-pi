/**
 * Footer component showing provider/model info, cwd, token stats, and status.
 * Mirrors the UX from @mariozechner/pi-coding-agent's FooterComponent.
 */

import { type Component, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

export class FooterComponent implements Component {
	private provider: string;
	private modelId: string;
	private contextTokens = 0;
	private contextWindow = 0;
	private autoCompaction = false;

	constructor(provider: string, modelId: string) {
		this.provider = provider;
		this.modelId = modelId;
	}

	setTokenInfo(contextTokens: number, contextWindow: number): void {
		this.contextTokens = contextTokens;
		this.contextWindow = contextWindow;
	}

	setAutoCompaction(enabled: boolean): void {
		this.autoCompaction = enabled;
	}

	invalidate(): void {
		// Stateless - re-computes each render
	}

	render(width: number): string[] {
		// Build path display
		let pwd = process.cwd();
		const home = process.env.HOME || process.env.USERPROFILE;
		if (home && pwd.startsWith(home)) {
			pwd = `~${pwd.slice(home.length)}`;
		}

		// Truncate path if too long
		if (pwd.length > width) {
			const half = Math.floor(width / 2) - 2;
			if (half > 0) {
				const start = pwd.slice(0, half);
				const end = pwd.slice(-(half - 1));
				pwd = `${start}...${end}`;
			} else {
				pwd = pwd.slice(0, Math.max(1, width));
			}
		}

		// Build right side: token info + model
		const modelLabel = `${this.provider}/${this.modelId}`;
		const rightParts: string[] = [];

		if (this.contextWindow > 0) {
			const pct = Math.round((this.contextTokens / this.contextWindow) * 100);
			const autoIndicator = this.autoCompaction ? "*" : "";
			rightParts.push(`${pct}%/${formatTokens(this.contextWindow)}${autoIndicator}`);
		}

		rightParts.push(modelLabel);
		const rightSide = rightParts.join("  ");

		const pwdWidth = visibleWidth(pwd);
		const rightWidth = visibleWidth(rightSide);
		const minPadding = 2;

		let statsLine: string;
		if (pwdWidth + minPadding + rightWidth <= width) {
			const padding = " ".repeat(width - pwdWidth - rightWidth);
			statsLine = pwd + padding + rightSide;
		} else {
			statsLine = truncateToWidth(pwd, width);
		}

		return [chalk.dim(statsLine)];
	}
}
