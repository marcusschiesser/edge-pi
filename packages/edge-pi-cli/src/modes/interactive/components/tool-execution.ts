/**
 * Component that renders a tool call with its result.
 * Mirrors the UX from @mariozechner/pi-coding-agent's ToolExecutionComponent.
 */

import { homedir } from "node:os";
import { Box, Container, Spacer, Text } from "@mariozechner/pi-tui";
import chalk from "chalk";
import { colors } from "../theme.js";

/** Preview line limit for bash output when collapsed */
const BASH_PREVIEW_LINES = 5;

/** Max lines for read/write/grep/find output when collapsed */
const DEFAULT_PREVIEW_LINES = 10;

function shortenPath(path: string): string {
	const home = homedir();
	if (path.startsWith(home)) {
		return `~${path.slice(home.length)}`;
	}
	return path;
}

/** Structured tool output that supports text and optional image data */
export interface ToolOutput {
	text: string;
	image?: { base64: string; mimeType: string };
}

export class ToolExecutionComponent extends Container {
	private contentBox: Box;
	private toolName: string;
	private args: Record<string, unknown>;
	private result?: {
		output: ToolOutput;
		isError: boolean;
	};
	private expanded = false;
	private isPartial = true;

	constructor(toolName: string, args: Record<string, unknown>) {
		super();
		this.toolName = toolName;
		this.args = args;

		this.addChild(new Spacer(1));
		this.contentBox = new Box(1, 1, colors.toolPendingBg);
		this.addChild(this.contentBox);

		this.updateDisplay();
	}

	updateArgs(args: Record<string, unknown>): void {
		this.args = args;
		this.updateDisplay();
	}

	updateResult(output: ToolOutput, isError: boolean, isPartial = false): void {
		this.result = { output, isError };
		this.isPartial = isPartial;
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
		// Set background based on state
		const bgFn = this.isPartial
			? colors.toolPendingBg
			: this.result?.isError
				? colors.toolErrorBg
				: colors.toolSuccessBg;

		this.contentBox.setBgFn(bgFn);
		this.contentBox.clear();

		const headerText = this.formatHeader();
		this.contentBox.addChild(new Text(headerText, 0, 0));

		if (this.result) {
			const output = this.result.output.text.trim();
			if (output) {
				const lines = output.split("\n");
				const maxLines = this.expanded ? lines.length : this.getPreviewLineCount();
				const displayLines = lines.slice(0, maxLines);
				const remaining = lines.length - maxLines;

				const styledOutput = displayLines.map((line) => chalk.gray(line)).join("\n");

				this.contentBox.addChild(new Text(`\n${styledOutput}`, 0, 0));

				if (remaining > 0) {
					this.contentBox.addChild(new Text(chalk.gray(`\n... (${remaining} more lines)`), 0, 0));
				}
			}
		}
	}

	private getPreviewLineCount(): number {
		if (this.toolName === "bash") return BASH_PREVIEW_LINES;
		return DEFAULT_PREVIEW_LINES;
	}

	private formatHeader(): string {
		switch (this.toolName) {
			case "bash": {
				const command = String(this.args.command || "");
				const timeout = this.args.timeout as number | undefined;
				const timeoutSuffix = timeout ? chalk.gray(` (timeout ${timeout}s)`) : "";
				return chalk.bold(`$ ${command || chalk.gray("...")}`) + timeoutSuffix;
			}
			case "read": {
				const path = shortenPath(String(this.args.file_path || this.args.path || ""));
				const offset = this.args.offset as number | undefined;
				const limit = this.args.limit as number | undefined;
				let pathDisplay = path ? chalk.cyan(path) : chalk.gray("...");
				if (offset !== undefined || limit !== undefined) {
					const startLine = offset ?? 1;
					const endLine = limit !== undefined ? startLine + limit - 1 : "";
					pathDisplay += chalk.yellow(`:${startLine}${endLine ? `-${endLine}` : ""}`);
				}
				return `${chalk.bold("read")} ${pathDisplay}`;
			}
			case "write": {
				const path = shortenPath(String(this.args.file_path || this.args.path || ""));
				return `${chalk.bold("write")} ${path ? chalk.cyan(path) : chalk.gray("...")}`;
			}
			case "edit": {
				const path = shortenPath(String(this.args.file_path || this.args.path || ""));
				return `${chalk.bold("edit")} ${path ? chalk.cyan(path) : chalk.gray("...")}`;
			}
			case "grep": {
				const pattern = String(this.args.pattern || "");
				const path = shortenPath(String(this.args.path || "."));
				const glob = this.args.glob ? ` (${this.args.glob})` : "";
				return `${chalk.bold("grep")} ${chalk.cyan(`/${pattern}/`)}${chalk.gray(` in ${path}${glob}`)}`;
			}
			case "find": {
				const pattern = String(this.args.pattern || "");
				const path = shortenPath(String(this.args.path || "."));
				return `${chalk.bold("find")} ${chalk.cyan(pattern)}${chalk.gray(` in ${path}`)}`;
			}
			case "ls": {
				const path = shortenPath(String(this.args.path || "."));
				return `${chalk.bold("ls")} ${chalk.cyan(path)}`;
			}
			default: {
				return chalk.bold(this.toolName);
			}
		}
	}
}
