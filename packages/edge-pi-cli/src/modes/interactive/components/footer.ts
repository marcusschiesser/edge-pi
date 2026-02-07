/**
 * Footer component showing provider/model info, cwd, and status.
 * Mirrors the UX from @mariozechner/pi-coding-agent's FooterComponent.
 */

import { type Component, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import chalk from "chalk";

export class FooterComponent implements Component {
	private provider: string;
	private modelId: string;

	constructor(provider: string, modelId: string) {
		this.provider = provider;
		this.modelId = modelId;
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

		// Model info on the right
		const rightSide = `${this.provider}/${this.modelId}`;
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
