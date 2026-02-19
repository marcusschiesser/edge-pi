import { tool } from "ai";
import { z } from "zod";
import { bytesToBase64, toUint8Array, toUtf8String, utf8ByteLength } from "../runtime/encoding.js";
import type { EdgePiRuntime } from "../runtime/types.js";
import { expandPath, resolveCwd, resolveReadPath } from "./path-utils.js";
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead } from "./truncate.js";

const readSchema = z.object({
	path: z.string().describe("Path to the file to read (relative or absolute)"),
	offset: z.number().describe("Line number to start reading from (1-indexed)").optional(),
	limit: z.number().describe("Maximum number of lines to read").optional(),
});

const IMAGE_EXTENSIONS: Record<string, string> = {
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	png: "image/png",
	gif: "image/gif",
	webp: "image/webp",
};

interface ReadResult {
	text: string;
	image?: {
		base64: string;
		mimeType: string;
	};
}

interface ToolOptions {
	cwd: string;
	runtime: EdgePiRuntime;
}

export function createReadTool(options: ToolOptions) {
	const runtime = options.runtime;
	const cwd = resolveCwd(options.cwd, runtime);
	return tool({
		description: `Read the contents of a file. Supports text files and images (jpg, png, gif, webp). Images are sent as attachments. For text files, output is truncated to ${DEFAULT_MAX_LINES} lines or ${DEFAULT_MAX_BYTES / 1024}KB (whichever is hit first). Use offset/limit for large files. When you need the full file, continue with offset until complete.`,
		inputSchema: readSchema,
		execute: async ({ path, offset, limit }, { abortSignal }): Promise<ReadResult> => {
			const normalizedPath = runtime.resolveWorkspacePath(expandPath(path, runtime), { cwd });
			const absolutePath = await resolveReadPath(path, cwd, runtime);
			if (abortSignal?.aborted) throw new Error("Operation aborted");
			try {
				await runtime.fs.access(absolutePath);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(
					`File not found: ${path} (normalized: ${normalizedPath}, resolved: ${absolutePath})\n${message}`,
				);
			}
			let fileValue: string | Uint8Array;
			try {
				fileValue = await runtime.fs.readFile(absolutePath);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`Failed to read file: ${path} (resolved: ${absolutePath})\n${message}`);
			}
			const bytes = toUint8Array(fileValue);
			const ext = path.toLowerCase().split(".").pop() ?? "";
			const mimeType = IMAGE_EXTENSIONS[ext];
			if (mimeType) {
				return { text: `Read image file [${mimeType}]`, image: { base64: bytesToBase64(bytes), mimeType } };
			}
			const textContent = toUtf8String(fileValue);
			const allLines = textContent.split("\n");
			const startLine = offset ? Math.max(0, offset - 1) : 0;
			if (startLine >= allLines.length) {
				throw new Error(`Offset ${offset} is beyond end of file (${allLines.length} lines total)`);
			}
			const startLineDisplay = startLine + 1;
			let selectedContent: string;
			let userLimitedLines: number | undefined;
			if (limit !== undefined) {
				const endLine = Math.min(startLine + limit, allLines.length);
				selectedContent = allLines.slice(startLine, endLine).join("\n");
				userLimitedLines = endLine - startLine;
			} else {
				selectedContent = allLines.slice(startLine).join("\n");
			}
			const truncation = truncateHead(selectedContent);
			let outputText = truncation.content;
			if (truncation.firstLineExceedsLimit) {
				const firstLineSize = formatSize(utf8ByteLength(allLines[startLine]));
				outputText = `[Line ${startLineDisplay} is ${firstLineSize}, exceeds ${formatSize(DEFAULT_MAX_BYTES)} limit. Use bash: sed -n '${startLineDisplay}p' ${path} | head -c ${DEFAULT_MAX_BYTES}]`;
			} else if (truncation.truncated) {
				const endLineDisplay = startLineDisplay + truncation.outputLines - 1;
				const nextOffset = endLineDisplay + 1;
				outputText +=
					truncation.truncatedBy === "lines"
						? `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${allLines.length}. Use offset=${nextOffset} to continue.]`
						: `\n\n[Showing lines ${startLineDisplay}-${endLineDisplay} of ${allLines.length} (${formatSize(DEFAULT_MAX_BYTES)} limit). Use offset=${nextOffset} to continue.]`;
			} else if (userLimitedLines !== undefined && startLine + userLimitedLines < allLines.length) {
				const nextOffset = startLine + userLimitedLines + 1;
				outputText += `\n\n[${allLines.length - (startLine + userLimitedLines)} more lines in file. Use offset=${nextOffset} to continue.]`;
			}
			return { text: outputText };
		},
		toModelOutput: ({ output }) =>
			output.image
				? {
						type: "content",
						value: [
							{ type: "text", text: output.text },
							{ type: "file-data", data: output.image.base64, mediaType: output.image.mimeType },
						],
					}
				: { type: "text", value: output.text },
	});
}
