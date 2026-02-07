import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../src/system-prompt.js";

describe("buildSystemPrompt", () => {
	describe("empty tools", () => {
		it("shows (none) for empty tools list", () => {
			const prompt = buildSystemPrompt({ selectedTools: [] });
			expect(prompt).toContain("Available tools:\n(none)");
		});

		it("includes file paths guideline even with no tools", () => {
			const prompt = buildSystemPrompt({ selectedTools: [] });
			expect(prompt).toContain("Show file paths clearly");
		});

		it("includes concise guideline", () => {
			const prompt = buildSystemPrompt({ selectedTools: [] });
			expect(prompt).toContain("Be concise");
		});
	});

	describe("default tools", () => {
		it("includes all default tools when no selection", () => {
			const prompt = buildSystemPrompt({});
			expect(prompt).toContain("- read:");
			expect(prompt).toContain("- bash:");
			expect(prompt).toContain("- edit:");
			expect(prompt).toContain("- write:");
		});
	});

	describe("selected tools", () => {
		it("includes only selected tools", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "grep"],
			});
			expect(prompt).toContain("- read:");
			expect(prompt).toContain("- grep:");
			expect(prompt).not.toContain("- bash:");
			expect(prompt).not.toContain("- edit:");
		});

		it("includes all 7 tools", () => {
			const prompt = buildSystemPrompt({
				selectedTools: ["read", "bash", "edit", "write", "grep", "find", "ls"],
			});
			expect(prompt).toContain("- read:");
			expect(prompt).toContain("- bash:");
			expect(prompt).toContain("- edit:");
			expect(prompt).toContain("- write:");
			expect(prompt).toContain("- grep:");
			expect(prompt).toContain("- find:");
			expect(prompt).toContain("- ls:");
		});
	});

	describe("guidelines", () => {
		it("includes bash file exploration when bash only", () => {
			const prompt = buildSystemPrompt({ selectedTools: ["bash"] });
			expect(prompt).toContain("Use bash for file operations");
		});

		it("prefers grep/find over bash when both available", () => {
			const prompt = buildSystemPrompt({ selectedTools: ["bash", "grep", "find"] });
			expect(prompt).toContain("Prefer grep/find/ls tools over bash");
		});

		it("includes read-before-edit guideline when both available", () => {
			const prompt = buildSystemPrompt({ selectedTools: ["read", "edit"] });
			expect(prompt).toContain("Use read to examine files before editing");
		});

		it("includes edit precision guideline", () => {
			const prompt = buildSystemPrompt({ selectedTools: ["edit"] });
			expect(prompt).toContain("Use edit for precise changes");
		});

		it("includes write guideline", () => {
			const prompt = buildSystemPrompt({ selectedTools: ["write"] });
			expect(prompt).toContain("Use write only for new files");
		});
	});

	describe("custom prompt", () => {
		it("uses custom prompt when provided", () => {
			const prompt = buildSystemPrompt({
				customPrompt: "You are a custom assistant.",
			});
			expect(prompt).toContain("You are a custom assistant.");
			expect(prompt).not.toContain("Available tools:");
		});

		it("includes date/time even with custom prompt", () => {
			const prompt = buildSystemPrompt({
				customPrompt: "Custom.",
			});
			expect(prompt).toContain("Current date and time:");
		});

		it("includes working directory with custom prompt", () => {
			const prompt = buildSystemPrompt({
				customPrompt: "Custom.",
				cwd: "/test/dir",
			});
			expect(prompt).toContain("Current working directory: /test/dir");
		});
	});

	describe("append system prompt", () => {
		it("appends additional text", () => {
			const prompt = buildSystemPrompt({
				appendSystemPrompt: "Additional instructions here.",
			});
			expect(prompt).toContain("Additional instructions here.");
		});

		it("appends to custom prompt too", () => {
			const prompt = buildSystemPrompt({
				customPrompt: "Base prompt.",
				appendSystemPrompt: "Extra.",
			});
			expect(prompt).toContain("Base prompt.");
			expect(prompt).toContain("Extra.");
		});
	});

	describe("context files", () => {
		it("includes context file content", () => {
			const prompt = buildSystemPrompt({
				contextFiles: [{ path: "AGENTS.md", content: "This is the agent config." }],
			});
			expect(prompt).toContain("# Project Context");
			expect(prompt).toContain("## AGENTS.md");
			expect(prompt).toContain("This is the agent config.");
		});

		it("includes multiple context files", () => {
			const prompt = buildSystemPrompt({
				contextFiles: [
					{ path: "file1.md", content: "Content 1" },
					{ path: "file2.md", content: "Content 2" },
				],
			});
			expect(prompt).toContain("## file1.md");
			expect(prompt).toContain("Content 1");
			expect(prompt).toContain("## file2.md");
			expect(prompt).toContain("Content 2");
		});
	});

	describe("date, time, and cwd", () => {
		it("includes current date/time", () => {
			const prompt = buildSystemPrompt({});
			expect(prompt).toContain("Current date and time:");
		});

		it("includes working directory", () => {
			const prompt = buildSystemPrompt({ cwd: "/my/project" });
			expect(prompt).toContain("Current working directory: /my/project");
		});

		it("uses process.cwd() when no cwd provided", () => {
			const prompt = buildSystemPrompt({});
			expect(prompt).toContain("Current working directory:");
			expect(prompt).toContain(process.cwd());
		});
	});
});
