import { mkdtempSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { expandPath, resolveReadPath, resolveToCwd } from "../src/tools/path-utils.js";

describe("path-utils", () => {
	describe("expandPath", () => {
		it("should expand ~ to home directory", () => {
			const result = expandPath("~");
			expect(result).not.toContain("~");
		});

		it("should expand ~/path to home directory", () => {
			const result = expandPath("~/Documents/file.txt");
			expect(result).not.toContain("~/");
		});

		it("should normalize Unicode spaces", () => {
			const withNBSP = "file\u00A0name.txt";
			const result = expandPath(withNBSP);
			expect(result).toBe("file name.txt");
		});
	});

	describe("resolveToCwd", () => {
		it("should resolve absolute paths as-is", () => {
			const result = resolveToCwd("/absolute/path/file.txt", "/some/cwd");
			expect(result).toBe("/absolute/path/file.txt");
		});

		it("should resolve relative paths against cwd", () => {
			const result = resolveToCwd("relative/file.txt", "/some/cwd");
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

		it("should resolve existing file path", () => {
			writeFileSync(join(tempDir, "test-file.txt"), "content");
			const result = resolveReadPath("test-file.txt", tempDir);
			expect(result).toBe(join(tempDir, "test-file.txt"));
		});

		it("should handle curly quotes vs straight quotes (macOS filenames)", () => {
			const curlyQuoteName = "Capture d\u2019cran.txt";
			const straightQuoteName = "Capture d'cran.txt";

			expect(curlyQuoteName).not.toBe(straightQuoteName);

			writeFileSync(join(tempDir, curlyQuoteName), "content");

			const result = resolveReadPath(straightQuoteName, tempDir);
			expect(result).toBe(join(tempDir, curlyQuoteName));
		});

		it("should handle macOS screenshot AM/PM variant with narrow no-break space", () => {
			const macosName = "Screenshot 2024-01-01 at 10.00.00\u202FAM.png";
			const userName = "Screenshot 2024-01-01 at 10.00.00 AM.png";

			writeFileSync(join(tempDir, macosName), "content");

			const result = resolveReadPath(userName, tempDir);
			expect(result).toBe(join(tempDir, macosName));
		});

		it("should return resolved path for non-existent files (no error)", () => {
			const result = resolveReadPath("nonexistent.txt", tempDir);
			expect(result).toBe(join(tempDir, "nonexistent.txt"));
		});
	});
});
