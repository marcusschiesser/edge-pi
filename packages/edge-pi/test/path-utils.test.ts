import { mkdtempSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNodeRuntime } from "../src/runtime/node-runtime.js";
import { expandPath, resolveReadPath, resolveToCwd } from "../src/tools/path-utils.js";

const runtime = createNodeRuntime();

describe("path-utils", () => {
	describe("expandPath", () => {
		it("should expand ~ to home directory", () => {
			const result = expandPath("~", runtime);
			expect(result).not.toContain("~");
		});

		it("should expand ~/path to home directory", () => {
			const result = expandPath("~/Documents/file.txt", runtime);
			expect(result).not.toContain("~/");
		});

		it("should normalize Unicode spaces", () => {
			const withNBSP = "file\u00A0name.txt";
			const result = expandPath(withNBSP, runtime);
			expect(result).toBe("file name.txt");
		});
	});

	describe("resolveToCwd", () => {
		it("should resolve absolute paths as-is", () => {
			const result = resolveToCwd("/absolute/path/file.txt", "/some/cwd", runtime);
			expect(result).toBe("/absolute/path/file.txt");
		});

		it("should resolve relative paths against cwd", () => {
			const result = resolveToCwd("relative/file.txt", "/some/cwd", runtime);
			expect(result).toBe("/some/cwd/relative/file.txt");
		});
	});

	describe("resolveReadPath", () => {
		let tempDir: string;

		beforeEach(() => {
			tempDir = mkdtempSync(join(tmpdir(), "edge-pi-path-test-"));
		});

		afterEach(() => {
			try {
				const files = readdirSync(tempDir);
				for (const file of files) {
					unlinkSync(join(tempDir, file));
				}
				rmdirSync(tempDir);
			} catch {
				// Ignore cleanup errors
			}
		});

		it("should resolve existing file path", async () => {
			writeFileSync(join(tempDir, "test-file.txt"), "content");
			const result = await resolveReadPath("test-file.txt", tempDir, runtime);
			expect(result).toBe(join(tempDir, "test-file.txt"));
		});

		it("should handle curly quotes vs straight quotes (macOS filenames)", async () => {
			const curlyQuoteName = "Capture d\u2019cran.txt";
			const straightQuoteName = "Capture d'cran.txt";
			writeFileSync(join(tempDir, curlyQuoteName), "content");
			const result = await resolveReadPath(straightQuoteName, tempDir, runtime);
			expect(result).toBe(join(tempDir, curlyQuoteName));
		});

		it("should return resolved path for non-existent files (no error)", async () => {
			const result = await resolveReadPath("nonexistent.txt", tempDir, runtime);
			expect(result).toBe(join(tempDir, "nonexistent.txt"));
		});
	});
});
