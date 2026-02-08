import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAllTools, createCodingTools, createReadOnlyTools } from "../src/tools/index.js";

/** Vercel AI SDK tools expect a second arg with { abortSignal }. */
const ctx = () => ({ abortSignal: new AbortController().signal });

describe("Coding Agent Tools", () => {
	let testDir: string;
	// ToolSet = Record<string, Tool> makes execute possibly undefined; use any for test ergonomics
	let tools: any;

	beforeEach(() => {
		testDir = join(tmpdir(), `edge-pi-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(testDir, { recursive: true });
		tools = createAllTools(testDir);
	});

	afterEach(() => {
		rmSync(testDir, { recursive: true, force: true });
	});

	describe("read tool", () => {
		it("should read file contents that fit within limits", async () => {
			const testFile = join(testDir, "test.txt");
			writeFileSync(testFile, "Hello, world!\nLine 2\nLine 3");

			const result = await tools.read.execute({ path: testFile }, ctx());
			expect(result.text).toContain("Hello, world!");
			expect(result.text).toContain("Line 2");
			expect(result.text).toContain("Line 3");
			expect(result.text).not.toContain("Use offset=");
		});

		it("should handle non-existent files", async () => {
			const testFile = join(testDir, "nonexistent.txt");
			await expect(tools.read.execute({ path: testFile }, ctx())).rejects.toThrow(/ENOENT|not found/i);
		});

		it("should truncate files exceeding line limit", async () => {
			const testFile = join(testDir, "large.txt");
			const lines = Array.from({ length: 2500 }, (_, i) => `Line ${i + 1}`);
			writeFileSync(testFile, lines.join("\n"));

			const result = await tools.read.execute({ path: testFile }, ctx());
			expect(result.text).toContain("Line 1");
			expect(result.text).toContain("Line 2000");
			expect(result.text).not.toContain("Line 2001");
			expect(result.text).toContain("Use offset=");
		});

		it("should handle offset parameter", async () => {
			const testFile = join(testDir, "offset-test.txt");
			const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
			writeFileSync(testFile, lines.join("\n"));

			const result = await tools.read.execute({ path: testFile, offset: 51 }, ctx());
			expect(result.text).not.toContain("Line 50\n");
			expect(result.text).toContain("Line 51");
			expect(result.text).toContain("Line 100");
		});

		it("should handle limit parameter", async () => {
			const testFile = join(testDir, "limit-test.txt");
			const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
			writeFileSync(testFile, lines.join("\n"));

			const result = await tools.read.execute({ path: testFile, limit: 10 }, ctx());
			expect(result.text).toContain("Line 1");
			expect(result.text).toContain("Line 10");
			expect(result.text).not.toContain("Line 11\n");
			expect(result.text).toContain("Use offset=");
		});

		it("should handle offset + limit together", async () => {
			const testFile = join(testDir, "offset-limit-test.txt");
			const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
			writeFileSync(testFile, lines.join("\n"));

			const result = await tools.read.execute({ path: testFile, offset: 41, limit: 20 }, ctx());
			expect(result.text).not.toContain("Line 40\n");
			expect(result.text).toContain("Line 41");
			expect(result.text).toContain("Line 60");
			expect(result.text).not.toContain("Line 61\n");
		});

		it("should show error when offset is beyond file length", async () => {
			const testFile = join(testDir, "short.txt");
			writeFileSync(testFile, "Line 1\nLine 2\nLine 3");

			await expect(tools.read.execute({ path: testFile, offset: 100 }, ctx())).rejects.toThrow(/beyond/i);
		});

		it("should detect image files by extension", async () => {
			const png1x1Base64 =
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2Z0AAAAASUVORK5CYII=";
			const pngBuffer = Buffer.from(png1x1Base64, "base64");

			const testFile = join(testDir, "image.png");
			writeFileSync(testFile, pngBuffer);

			const result = await tools.read.execute({ path: testFile }, ctx());
			expect(result.text).toContain("image");
			expect(result.image).toBeDefined();
			expect(result.image.mimeType).toBe("image/png");
			expect(result.image.base64).toBe(png1x1Base64);
		});
	});

	describe("write tool", () => {
		it("should write file contents", async () => {
			const testFile = join(testDir, "write-test.txt");

			const result = await tools.write.execute({ path: testFile, content: "Test content" }, ctx());
			expect(result).toContain("Successfully wrote");

			const written = readFileSync(testFile, "utf-8");
			expect(written).toBe("Test content");
		});

		it("should create parent directories", async () => {
			const testFile = join(testDir, "nested", "dir", "test.txt");

			const result = await tools.write.execute({ path: testFile, content: "Nested content" }, ctx());
			expect(result).toContain("Successfully wrote");

			const written = readFileSync(testFile, "utf-8");
			expect(written).toBe("Nested content");
		});
	});

	describe("edit tool", () => {
		it("should replace text in file", async () => {
			const testFile = join(testDir, "edit-test.txt");
			writeFileSync(testFile, "Hello, world!");

			const result = await tools.edit.execute({ path: testFile, oldText: "world", newText: "testing" }, ctx());

			expect(result).toContain("Successfully");
			const content = readFileSync(testFile, "utf-8");
			expect(content).toContain("testing");
		});

		it("should fail if text not found", async () => {
			const testFile = join(testDir, "edit-test.txt");
			writeFileSync(testFile, "Hello, world!");

			await expect(
				tools.edit.execute({ path: testFile, oldText: "nonexistent", newText: "testing" }, ctx()),
			).rejects.toThrow(/Could not find/);
		});

		it("should fail if text appears multiple times", async () => {
			const testFile = join(testDir, "edit-test.txt");
			writeFileSync(testFile, "foo foo foo");

			await expect(tools.edit.execute({ path: testFile, oldText: "foo", newText: "bar" }, ctx())).rejects.toThrow(
				/Found 3 occurrences/,
			);
		});

		it("should match text with trailing whitespace stripped (fuzzy)", async () => {
			const testFile = join(testDir, "trailing-ws.txt");
			writeFileSync(testFile, "line one   \nline two  \nline three\n");

			const result = await tools.edit.execute(
				{ path: testFile, oldText: "line one\nline two\n", newText: "replaced\n" },
				ctx(),
			);

			expect(result).toContain("Successfully");
			const content = readFileSync(testFile, "utf-8");
			expect(content).toBe("replaced\nline three\n");
		});

		it("should match smart quotes to ASCII quotes (fuzzy)", async () => {
			const testFile = join(testDir, "smart-quotes.txt");
			writeFileSync(testFile, "console.log(\u2018hello\u2019);\n");

			const result = await tools.edit.execute(
				{ path: testFile, oldText: "console.log('hello');", newText: "console.log('world');" },
				ctx(),
			);

			expect(result).toContain("Successfully");
			const content = readFileSync(testFile, "utf-8");
			expect(content).toContain("world");
		});

		it("should match LF oldText against CRLF file content", async () => {
			const testFile = join(testDir, "crlf-test.txt");
			writeFileSync(testFile, "line one\r\nline two\r\nline three\r\n");

			const result = await tools.edit.execute(
				{ path: testFile, oldText: "line two\n", newText: "replaced line\n" },
				ctx(),
			);

			expect(result).toContain("Successfully");
		});

		it("should preserve CRLF line endings after edit", async () => {
			const testFile = join(testDir, "crlf-preserve.txt");
			writeFileSync(testFile, "first\r\nsecond\r\nthird\r\n");

			await tools.edit.execute({ path: testFile, oldText: "second\n", newText: "REPLACED\n" }, ctx());

			const content = readFileSync(testFile, "utf-8");
			expect(content).toBe("first\r\nREPLACED\r\nthird\r\n");
		});

		it("should preserve UTF-8 BOM after edit", async () => {
			const testFile = join(testDir, "bom-test.txt");
			writeFileSync(testFile, "\uFEFFfirst\r\nsecond\r\nthird\r\n");

			await tools.edit.execute({ path: testFile, oldText: "second\n", newText: "REPLACED\n" }, ctx());

			const content = readFileSync(testFile, "utf-8");
			expect(content).toBe("\uFEFFfirst\r\nREPLACED\r\nthird\r\n");
		});
	});

	describe("bash tool", () => {
		it("should execute simple commands", async () => {
			const result = await tools.bash.execute({ command: "echo 'test output'" }, ctx());
			expect(result).toContain("test output");
		});

		it("should handle command errors", async () => {
			await expect(tools.bash.execute({ command: "exit 1" }, ctx())).rejects.toThrow(/(failed|code 1)/i);
		});

		it("should respect timeout", async () => {
			await expect(tools.bash.execute({ command: "sleep 5", timeout: 1 }, ctx())).rejects.toThrow(/timed out/i);
		});
	});

	describe("grep tool", () => {
		it("should find matching lines", async () => {
			const testFile = join(testDir, "example.txt");
			writeFileSync(testFile, "first line\nmatch line\nlast line");

			const result = await tools.grep.execute({ pattern: "match", path: testFile }, ctx());

			expect(result).toContain("match line");
		});

		it("should respect limit and include context lines", async () => {
			const testFile = join(testDir, "context.txt");
			writeFileSync(testFile, "before\nmatch one\nafter\nmiddle\nmatch two\nafter two");

			const result = await tools.grep.execute({ pattern: "match", path: testFile, limit: 1, context: 1 }, ctx());

			expect(result).toContain("before");
			expect(result).toContain("match one");
			expect(result).toContain("after");
			expect(result).not.toContain("match two");
		});
	});

	describe("find tool", () => {
		it("should find files by pattern", async () => {
			writeFileSync(join(testDir, "file1.txt"), "content");
			writeFileSync(join(testDir, "file2.txt"), "content");
			mkdirSync(join(testDir, "sub"));
			writeFileSync(join(testDir, "sub", "file3.txt"), "content");

			const result = await tools.find.execute({ pattern: "**/*.txt", path: testDir }, ctx());

			expect(result).toContain("file1.txt");
			expect(result).toContain("file2.txt");
			expect(result).toContain("file3.txt");
		});
	});

	describe("ls tool", () => {
		it("should list files and directories", async () => {
			writeFileSync(join(testDir, "file.txt"), "content");
			mkdirSync(join(testDir, "subdir"));
			writeFileSync(join(testDir, ".hidden"), "secret");

			const result = await tools.ls.execute({ path: testDir }, ctx());

			expect(result).toContain("file.txt");
			expect(result).toContain("subdir/");
			expect(result).toContain(".hidden");
		});
	});

	describe("tool factory functions", () => {
		it("createCodingTools returns read, bash, edit, write", () => {
			const codingTools = createCodingTools(testDir);
			expect(codingTools).toHaveProperty("read");
			expect(codingTools).toHaveProperty("bash");
			expect(codingTools).toHaveProperty("edit");
			expect(codingTools).toHaveProperty("write");
			expect(codingTools).not.toHaveProperty("grep");
			expect(codingTools).not.toHaveProperty("find");
			expect(codingTools).not.toHaveProperty("ls");
		});

		it("createReadOnlyTools returns read, grep, find, ls", () => {
			const readOnlyTools = createReadOnlyTools(testDir);
			expect(readOnlyTools).toHaveProperty("read");
			expect(readOnlyTools).toHaveProperty("grep");
			expect(readOnlyTools).toHaveProperty("find");
			expect(readOnlyTools).toHaveProperty("ls");
			expect(readOnlyTools).not.toHaveProperty("bash");
			expect(readOnlyTools).not.toHaveProperty("edit");
			expect(readOnlyTools).not.toHaveProperty("write");
		});

		it("createAllTools returns all 7 tools", () => {
			const allTools = createAllTools(testDir);
			expect(Object.keys(allTools)).toHaveLength(7);
			expect(allTools).toHaveProperty("read");
			expect(allTools).toHaveProperty("bash");
			expect(allTools).toHaveProperty("edit");
			expect(allTools).toHaveProperty("write");
			expect(allTools).toHaveProperty("grep");
			expect(allTools).toHaveProperty("find");
			expect(allTools).toHaveProperty("ls");
		});
	});
});
