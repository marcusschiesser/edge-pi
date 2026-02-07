/**
 * Component that renders a streaming assistant message with markdown.
 * Mirrors the UX from @mariozechner/pi-coding-agent.
 */

import { Container, Markdown, type MarkdownTheme, Spacer, Text } from "@mariozechner/pi-tui";
import chalk from "chalk";
import { getMarkdownTheme } from "../theme.js";

export class AssistantMessageComponent extends Container {
	private contentContainer: Container;
	private markdownTheme: MarkdownTheme;
	private lastText = "";
	private isAborted = false;
	private errorMessage?: string;

	constructor(markdownTheme: MarkdownTheme = getMarkdownTheme()) {
		super();
		this.markdownTheme = markdownTheme;
		this.contentContainer = new Container();
		this.addChild(this.contentContainer);
	}

	updateText(text: string): void {
		this.lastText = text;
		this.rebuild();
	}

	setAborted(message?: string): void {
		this.isAborted = true;
		this.errorMessage = message;
		this.rebuild();
	}

	setError(message: string): void {
		this.errorMessage = message;
		this.rebuild();
	}

	override invalidate(): void {
		super.invalidate();
		this.rebuild();
	}

	private rebuild(): void {
		this.contentContainer.clear();

		if (this.lastText.trim()) {
			this.contentContainer.addChild(new Spacer(1));
			this.contentContainer.addChild(new Markdown(this.lastText.trim(), 1, 0, this.markdownTheme));
		}

		if (this.isAborted) {
			const msg =
				this.errorMessage && this.errorMessage !== "Request was aborted" ? this.errorMessage : "Operation aborted";
			this.contentContainer.addChild(new Spacer(1));
			this.contentContainer.addChild(new Text(chalk.red(msg), 1, 0));
		} else if (this.errorMessage) {
			this.contentContainer.addChild(new Spacer(1));
			this.contentContainer.addChild(new Text(chalk.red(`Error: ${this.errorMessage}`), 1, 0));
		}
	}
}
