/**
 * Read tool - reads file contents as Vercel AI tool().
 */

import { constants, promises as fs } from "node:fs";
import { tool } from "ai";
import { z } from "zod";
import { resolveReadPath } from "./path-utils.js";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead } from "./truncate.js";

const readSchema = z.object({
	path: z.string().describe("Path to the file to read (relative or absolute)"),
	offset: z.number().describe("Line number to start reading from (1-indexed)").optional(),
	limit: z.number().describe("Maximum number of lines to read").optional(),
});

export function createReadTool(cwd: string) {
	return tool({
		description: `Read the contents of a file. Output is truncated to ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.`,
		inputSchema: readSchema,
		execute: async ({ path, offset, limit }, { abortSignal }) => {
			const absolutePath = resolveReadPath(path, cwd);

			// Check abort
			if (abortSignal?.aborted) {
				throw new Error("Operation aborted");
			}

			// Check if file exists
			await fs.access(absolutePath, constants.R_OK);

			// Read the file
			const buffer = await fs.readFile(absolutePath);

			// Simple image detection by extension
			const ext = path.toLowerCase().split(".").pop() ?? "";
			const imageExts = ["jpg", "jpeg", "png", "gif", "webp"];
			if (imageExts.includes(ext)) {
				return `[Image file: ${path}. Use a dedicated image viewer to inspect.]`;
			}

			// Read as text
			const textContent = buffer.toString("utf-8");
			const allLines = textContent.split("\n");
			const totalFileLines = allLines.length;

			// Apply offset if specified (1-indexed to 0-indexed)
			const startLine = offset ? Math.max(0, offset - 1) : 0;
			const startLineDisplay = startLine + 1; // For display (1-indexed)

			// Check if offset is out of bounds
			if (startLine >= allLines.length) {
				throw new Error(`Offset ${offset} is beyond end of file (${allLines.length} lines total)`);
			}

			// If limit is specified by user, use it; otherwise we'll let truncateHead decide
			let selectedContent: string;
			let userLimitedLines: number | undefined;
			if (limit !== undefined) {
				const endLine = Math.min(startLine + limit, allLines.length);
				selectedContent = allLines.slice(startLine, endLine).join("\n");
				userLimitedLines = endLine - startLine;
			} else {
				selectedContent = allLines.slice(startLine).join("\n");
			}

			// Apply truncation (respects both line and byte limits)
			const truncation = truncateHead(selectedContent);

			let outputText: string;

			if (truncation.firstLineExceedsLimit) {
				// First line at offset exceeds limit - tell model to use bash
				const firstLineSize = formatSize(Buffer.byteLength(allLines[startLine], "utf-8"));
				outputText = `[Line ${startLineDisplay} is ${firstLineSize}, exceeds ${formatSize(DEFAULT_MAX_BYTES)} limit. Use bash: sed -n '${startLineDisplay}p' ${path} | head -c ${DEFAULT_MAX_BYTES}]`;
			} else if (truncation.truncated) {
				// Truncation occurred - build actionable notice
				const endLineDisplay = startLineDisplay + truncation.outputLines - 1;
				const nextOffset = endLineDisplay + 1;

				outputText = truncation.content;

				if (truncation.truncatedBy === "lines") {
					outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines}. Use offset=${nextOffset} to continue.]`;
				} else {
					outputText += `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${totalFileLines} (${formatSize(DEFAULT_MAX_BYTES)} limit). Use offset=${nextOffset} to continue.]`;
				}
			} else if (userLimitedLines !== undefined && startLine + userLimitedLines < allLines.length) {
				// User specified limit, there's more content, but no truncation
				const remaining = allLines.length - (startLine + userLimitedLines);
				const nextOffset = startLine + userLimitedLines + 1;

				outputText = truncation.content;
				outputText += `\n\n[${remaining} more lines in file. Use offset=${nextOffset} to continue.]`;
			} else {
				// No truncation, no user limit exceeded
				outputText = truncation.content;
			}

			return outputText;
		},
	});
}
