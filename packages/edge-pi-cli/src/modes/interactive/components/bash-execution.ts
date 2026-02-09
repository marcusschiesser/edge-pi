import { Box, Container, Loader, Spacer, Text, type TUI } from "@mariozechner/pi-tui";
import chalk from "chalk";
import { formatBashFooter, truncateDisplayLines } from "../bash-helpers.js";

export class BashExecutionComponent extends Container {
	private command: string;
	private ui: TUI;
	private excludeFromContext: boolean;
	private contentBox: Box;
	private loader: Loader;
	private output = "";
	private expanded = false;
	private complete = false;

	constructor(command: string, ui: TUI, excludeFromContext = false) {
		super();
		this.command = command;
		this.ui = ui;
		this.excludeFromContext = excludeFromContext;

		this.addChild(new Spacer(1));
		this.contentBox = new Box(1, 1, (s: string) => chalk.bgHex("#282832")(s));
		this.addChild(this.contentBox);

		this.loader = new Loader(
			this.ui,
			(s) => chalk.cyan(s),
			(s) => chalk.dim(s),
			"Running...",
		);
		this.loader.start();

		this.updateDisplay();
	}

	appendOutput(chunk: string): void {
		this.output += chunk;
		this.updateDisplay();
	}

	setComplete(exitCode: number | undefined, cancelled: boolean, truncated = false, fullOutputPath?: string): void {
		this.complete = true;
		this.loader.stop();

		const rawFooter = formatBashFooter(exitCode, cancelled, truncated, fullOutputPath);
		if (rawFooter) {
			// Apply chalk styling based on status
			let styledFooter: string;
			if (cancelled) {
				styledFooter = chalk.dim(rawFooter);
			} else if (exitCode !== undefined && exitCode !== 0) {
				styledFooter = chalk.red(rawFooter);
			} else {
				styledFooter = chalk.dim(rawFooter);
			}

			this.output = this.output.trimEnd();
			this.output += `\n\n${styledFooter}\n`;
		}

		this.updateDisplay();
	}

	setExpanded(expanded: boolean): void {
		this.expanded = expanded;
		this.updateDisplay();
	}

	getOutput(): string {
		return this.output;
	}

	private updateDisplay(): void {
		this.contentBox.clear();

		const titlePrefix = this.excludeFromContext ? chalk.dim("!!") : chalk.dim("!");
		const title = `${titlePrefix} ${chalk.bold(`$ ${this.command}`)}`;

		const header = this.excludeFromContext ? chalk.dim(title) : title;
		this.contentBox.addChild(new Text(header, 0, 0));

		if (!this.complete) {
			this.contentBox.addChild(new Text("\n", 0, 0));
			this.contentBox.addChild(this.loader);
			this.contentBox.addChild(new Text("\n", 0, 0));
		}

		const { display, hiddenCount } = truncateDisplayLines(this.output, this.expanded);
		if (display) {
			this.contentBox.addChild(new Text(`\n${chalk.white(display)}`, 0, 0));
			if (hiddenCount > 0) {
				this.contentBox.addChild(new Text(chalk.gray(`\n... (${hiddenCount} more lines)`), 0, 0));
			}
		}
	}
}
