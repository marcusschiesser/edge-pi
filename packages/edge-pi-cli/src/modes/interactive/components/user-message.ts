/**
 * Component that renders a user message with markdown and styled background.
 * Mirrors the UX from @mariozechner/pi-coding-agent.
 */

import { Container, Markdown, type MarkdownTheme, Spacer } from "@mariozechner/pi-tui";
import { colors, getMarkdownTheme } from "../theme.js";

export class UserMessageComponent extends Container {
	constructor(text: string, markdownTheme: MarkdownTheme = getMarkdownTheme()) {
		super();
		this.addChild(new Spacer(1));
		this.addChild(
			new Markdown(text, 1, 1, markdownTheme, {
				bgColor: colors.userMessageBg,
				color: colors.userMessageText,
			}),
		);
	}
}
