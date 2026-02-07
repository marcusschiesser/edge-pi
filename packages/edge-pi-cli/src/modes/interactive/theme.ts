/**
 * Minimal theme for edge-pi-cli TUI.
 *
 * Uses chalk for ANSI styling. Provides MarkdownTheme and EditorTheme
 * compatible with @mariozechner/pi-tui components.
 */

import type { EditorTheme, MarkdownTheme, SelectListTheme } from "@mariozechner/pi-tui";
import chalk from "chalk";

// ============================================================================
// Color helpers
// ============================================================================

export const colors = {
	accent: chalk.cyan,
	muted: chalk.gray,
	dim: chalk.dim,
	bold: chalk.bold,
	italic: chalk.italic,
	error: chalk.red,
	warning: chalk.yellow,
	success: chalk.green,

	// Tool status backgrounds
	toolPendingBg: chalk.bgGray,
	toolSuccessBg: chalk.bgGray,
	toolErrorBg: chalk.bgRed,

	// User message
	userMessageBg: (text: string) => chalk.bgGray(text),
	userMessageText: (text: string) => chalk.white(text),
};

// ============================================================================
// TUI Theme objects
// ============================================================================

export function getMarkdownTheme(): MarkdownTheme {
	return {
		heading: (text: string) => chalk.bold.cyan(text),
		link: (text: string) => chalk.cyan(text),
		linkUrl: (text: string) => chalk.dim.cyan(text),
		code: (text: string) => chalk.yellow(text),
		codeBlock: (text: string) => chalk.gray(text),
		codeBlockBorder: (text: string) => chalk.gray(text),
		quote: (text: string) => chalk.italic.gray(text),
		quoteBorder: (text: string) => chalk.gray(text),
		hr: (text: string) => chalk.gray(text),
		listBullet: (text: string) => chalk.cyan(text),
		bold: (text: string) => chalk.bold(text),
		italic: (text: string) => chalk.italic(text),
		underline: (text: string) => chalk.underline(text),
		strikethrough: (text: string) => chalk.strikethrough(text),
	};
}

export function getSelectListTheme(): SelectListTheme {
	return {
		selectedPrefix: (text: string) => chalk.cyan(text),
		selectedText: (text: string) => chalk.cyan(text),
		description: (text: string) => chalk.gray(text),
		scrollInfo: (text: string) => chalk.gray(text),
		noMatch: (text: string) => chalk.gray(text),
	};
}

export function getEditorTheme(): EditorTheme {
	return {
		borderColor: (text: string) => chalk.gray(text),
		selectList: getSelectListTheme(),
	};
}
