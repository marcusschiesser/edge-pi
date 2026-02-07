/**
 * Edit tool - surgical file editing as Vercel AI tool().
 */

import { constants, promises as fs } from "node:fs";
import { tool } from "ai";
import { z } from "zod";
import {
	detectLineEnding,
	fuzzyFindText,
	generateDiffString,
	normalizeForFuzzyMatch,
	normalizeToLF,
	restoreLineEndings,
	stripBom,
} from "./edit-diff.js";
import { resolveToCwd } from "./path-utils.js";

const editSchema = z.object({
	path: z.string().describe("Path to the file to edit (relative or absolute)"),
	oldText: z.string().describe("Exact text to find and replace (must match exactly)"),
	newText: z.string().describe("New text to replace the old text with"),
});

export function createEditTool(cwd: string) {
	return tool({
		description:
			"Edit a file by replacing exact text. The oldText must match exactly (including whitespace). Use this for precise, surgical edits.",
		inputSchema: editSchema,
		execute: async ({ path, oldText, newText }, { abortSignal }) => {
			const absolutePath = resolveToCwd(path, cwd);

			// Check abort
			if (abortSignal?.aborted) {
				throw new Error("Operation aborted");
			}

			// Check if file exists
			try {
				await fs.access(absolutePath, constants.R_OK | constants.W_OK);
			} catch {
				throw new Error(`File not found: ${path}`);
			}

			// Read the file
			const buffer = await fs.readFile(absolutePath);
			const rawContent = buffer.toString("utf-8");

			// Strip BOM before matching (LLM won't include invisible BOM in oldText)
			const { bom, text: content } = stripBom(rawContent);

			const originalEnding = detectLineEnding(content);
			const normalizedContent = normalizeToLF(content);
			const normalizedOldText = normalizeToLF(oldText);
			const normalizedNewText = normalizeToLF(newText);

			// Find the old text using fuzzy matching (tries exact match first, then fuzzy)
			const matchResult = fuzzyFindText(normalizedContent, normalizedOldText);

			if (!matchResult.found) {
				throw new Error(
					`Could not find the exact text in ${path}. The old text must match exactly including all whitespace and newlines.`,
				);
			}

			// Count occurrences using fuzzy-normalized content for consistency
			const fuzzyContent = normalizeForFuzzyMatch(normalizedContent);
			const fuzzyOldText = normalizeForFuzzyMatch(normalizedOldText);
			const occurrences = fuzzyContent.split(fuzzyOldText).length - 1;

			if (occurrences > 1) {
				throw new Error(
					`Found ${occurrences} occurrences of the text in ${path}. The text must be unique. Please provide more context to make it unique.`,
				);
			}

			// Check abort before writing
			if (abortSignal?.aborted) {
				throw new Error("Operation aborted");
			}

			// Perform replacement using the matched text position
			const baseContent = matchResult.contentForReplacement;
			const newContent =
				baseContent.substring(0, matchResult.index) +
				normalizedNewText +
				baseContent.substring(matchResult.index + matchResult.matchLength);

			// Verify the replacement actually changed something
			if (baseContent === newContent) {
				throw new Error(
					`No changes made to ${path}. The replacement produced identical content. This might indicate an issue with special characters or the text not existing as expected.`,
				);
			}

			const finalContent = bom + restoreLineEndings(newContent, originalEnding);
			await fs.writeFile(absolutePath, finalContent, "utf-8");

			const diffResult = generateDiffString(baseContent, newContent);
			return `Successfully replaced text in ${path}.\n\n${diffResult.diff}`;
		},
	});
}
