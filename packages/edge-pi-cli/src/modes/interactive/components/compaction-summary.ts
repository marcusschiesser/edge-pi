/**
 * Compaction summary component.
 *
 * Displays a compact indicator showing that the context was compacted,
 * with expandable summary details.
 */

import { Box, Markdown, type MarkdownTheme, Spacer, Text } from "@mariozechner/pi-tui";
import chalk from "chalk";
import { getMarkdownTheme } from "../theme.js";

export class CompactionSummaryComponent extends Box {
	private expanded = false;
	private tokensBefore: number;
	private summary: string;
	private markdownTheme: MarkdownTheme;

	constructor(tokensBefore: number, summary: string, markdownTheme: MarkdownTheme = getMarkdownTheme()) {
		super(1, 1, (t: string) => chalk.bgHex("#282840")(t));
		this.tokensBefore = tokensBefore;
		this.summary = summary;
		this.markdownTheme = markdownTheme;
		this.updateDisplay();
	}

	setExpanded(expanded: boolean): void {
		this.expanded = expanded;
		this.updateDisplay();
	}

	override invalidate(): void {
		super.invalidate();
		this.updateDisplay();
	}

	private updateDisplay(): void {
		this.clear();

		const tokenStr = this.tokensBefore.toLocaleString();
		const label = chalk.cyan.bold("[compaction]");
		this.addChild(new Text(label, 0, 0));
		this.addChild(new Spacer(1));

		if (this.expanded) {
			const header = `**Compacted from ${tokenStr} tokens**\n\n`;
			this.addChild(new Markdown(header + this.summary, 0, 0, this.markdownTheme));
		} else {
			this.addChild(
				new Text(
					chalk.white(`Compacted from ${tokenStr} tokens (`) + chalk.dim("Ctrl+E") + chalk.white(" to expand)"),
					0,
					0,
				),
			);
		}
	}
}
