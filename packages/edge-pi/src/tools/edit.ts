import { constants } from "node:fs";
import { tool } from "ai";
import { z } from "zod";
import { createNodeRuntime } from "../runtime/node-runtime.js";
import type { EdgePiRuntime } from "../runtime/types.js";
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

interface ToolOptions {
	cwd: string;
	runtime?: EdgePiRuntime;
}

export function createEditTool(options: ToolOptions) {
	const runtime = options.runtime ?? createNodeRuntime();
	const cwd = options.cwd;
	return tool({
		description:
			"Edit a file by replacing exact text. The oldText must match exactly (including whitespace). Use this for precise, surgical edits.",
		inputSchema: editSchema,
		execute: async ({ path, oldText, newText }, { abortSignal }) => {
			const absolutePath = resolveToCwd(path, cwd, runtime);
			if (abortSignal?.aborted) throw new Error("Operation aborted");
			try {
				await runtime.fs.access(absolutePath, constants.R_OK | constants.W_OK);
			} catch {
				throw new Error(`File not found: ${path}`);
			}
			const fileValue = await runtime.fs.readFile(absolutePath);
			const rawContent = Buffer.isBuffer(fileValue) ? fileValue.toString("utf-8") : String(fileValue);
			const { bom, text: content } = stripBom(rawContent);
			const originalEnding = detectLineEnding(content);
			const normalizedContent = normalizeToLF(content);
			const normalizedOldText = normalizeToLF(oldText);
			const normalizedNewText = normalizeToLF(newText);
			const matchResult = fuzzyFindText(normalizedContent, normalizedOldText);
			if (!matchResult.found) {
				throw new Error(
					`Could not find the exact text in ${path}. The old text must match exactly including all whitespace and newlines.`,
				);
			}
			const occurrences =
				normalizeForFuzzyMatch(normalizedContent).split(normalizeForFuzzyMatch(normalizedOldText)).length - 1;
			if (occurrences > 1) {
				throw new Error(
					`Found ${occurrences} occurrences of the text in ${path}. The text must be unique. Please provide more context to make it unique.`,
				);
			}
			if (abortSignal?.aborted) throw new Error("Operation aborted");
			const baseContent = matchResult.contentForReplacement;
			const newContent =
				baseContent.substring(0, matchResult.index) +
				normalizedNewText +
				baseContent.substring(matchResult.index + matchResult.matchLength);
			if (baseContent === newContent) {
				throw new Error(`No changes made to ${path}. The replacement produced identical content.`);
			}
			await runtime.fs.writeFile(absolutePath, bom + restoreLineEndings(newContent, originalEnding), "utf-8");
			return `Successfully replaced text in ${path}.\n\n${generateDiffString(baseContent, newContent).diff}`;
		},
	});
}
