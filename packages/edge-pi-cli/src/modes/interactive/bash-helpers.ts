/**
 * Pure helper functions for inline bash features.
 * Extracted for testability — no TUI dependencies.
 */

/**
 * Parse a user input string that starts with `!` or `!!` as a bash command.
 * Returns null if the input is not a bash command or the command part is empty.
 */
export function parseBashInput(input: string): { command: string; excludeFromContext: boolean } | null {
	if (!input.startsWith("!")) return null;

	const excludeFromContext = input.startsWith("!!");
	const command = excludeFromContext ? input.slice(2).trim() : input.slice(1).trim();
	if (!command) return null;

	return { command, excludeFromContext };
}

/**
 * Build the footer string for a completed bash execution.
 * Returns raw text (caller applies chalk styling).
 */
export function formatBashFooter(
	exitCode: number | undefined,
	cancelled: boolean,
	truncated: boolean,
	fullOutputPath?: string,
): string {
	let footer = "";
	if (cancelled) {
		footer = "[cancelled]";
	} else if (exitCode !== undefined && exitCode !== 0) {
		footer = `[exit ${exitCode}]`;
	} else if (exitCode !== undefined) {
		footer = `[exit ${exitCode}]`;
	}

	if (truncated && fullOutputPath) {
		footer += (footer ? " " : "") + `(truncated, full output: ${fullOutputPath})`;
	}

	return footer;
}

const DEFAULT_MAX_COLLAPSED_LINES = 12;

/**
 * Truncate output lines for collapsed display.
 * Returns the visible portion and info about hidden lines.
 */
export function truncateDisplayLines(
	output: string,
	expanded: boolean,
	maxCollapsedLines = DEFAULT_MAX_COLLAPSED_LINES,
): { display: string; hiddenCount: number } {
	const trimmed = output.trimEnd();
	if (!trimmed) return { display: "", hiddenCount: 0 };

	const lines = trimmed.split("\n");
	if (expanded || lines.length <= maxCollapsedLines) {
		return { display: trimmed, hiddenCount: 0 };
	}

	const display = lines.slice(0, maxCollapsedLines).join("\n");
	return { display, hiddenCount: lines.length - maxCollapsedLines };
}

/**
 * Format pending steering/follow-up messages for display.
 * Returns an array of label strings (unstyled).
 */
export function formatPendingMessages(steeringMessages: string[], followUpMessages: string[]): string[] {
	const lines: string[] = [];
	for (const msg of steeringMessages) {
		lines.push(`Steering: ${msg}`);
	}
	for (const msg of followUpMessages) {
		lines.push(`Follow-up: ${msg}`);
	}
	return lines;
}
