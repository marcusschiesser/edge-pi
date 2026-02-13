/**
 * System prompt construction and project context loading.
 * Standalone copy - no dependency on old SDK.
 */

import type { ContextFile, Skill } from "./prompt-context.js";

/** Tool descriptions for system prompt */
const toolDescriptions: Record<string, string> = {
	read: "Read file contents",
	bash: "Execute bash commands (ls, grep, find, etc.)",
	edit: "Make surgical edits to files (find exact text and replace)",
	write: "Create or overwrite files",
	grep: "Search file contents for patterns (respects .gitignore)",
	find: "Find files by glob pattern (respects .gitignore)",
	ls: "List directory contents",
};

export interface BuildSystemPromptOptions {
	/** Custom system prompt (replaces default). */
	customPrompt?: string;
	/** Text to append to system prompt. */
	appendSystemPrompt?: string;
	/** Pre-loaded context files. */
	contextFiles?: ContextFile[];
	/** Pre-loaded skills as a keyed object map. */
	skills?: Record<string, Skill>;
}

export interface BuildSystemPromptCallOptions {
	/** Tools to include in prompt. Default: [read, bash, edit, write] */
	selectedTools?: string[];
	/** Working directory. Default: process.cwd() */
	cwd?: string;
}

/** Build the system prompt with tools, guidelines, and context */
export function buildSystemPrompt(
	options: BuildSystemPromptOptions = {},
	callOptions: BuildSystemPromptCallOptions = {},
): string {
	const { customPrompt, appendSystemPrompt, contextFiles: providedContextFiles, skills } = options;
	const { selectedTools, cwd } = callOptions;
	const resolvedCwd = cwd ?? process.cwd();

	const now = new Date();
	const dateTime = now.toLocaleString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		timeZoneName: "short",
	});

	const appendSection = appendSystemPrompt ? `\n\n${appendSystemPrompt}` : "";
	const tools = (selectedTools || ["read", "bash", "edit", "write"]).filter((t) => t in toolDescriptions);
	const skillsSection = formatSkillsForPrompt(skills);
	const hasRead = tools.includes("read");
	if (skillsSection && !hasRead) {
		throw new Error('skills require the "read" tool to be enabled in selectedTools');
	}

	const contextFiles = providedContextFiles ?? [];

	// Build tools list based on selected tools (only built-in tools with known descriptions)
	const toolsList = tools.length > 0 ? tools.map((t) => `- ${t}: ${toolDescriptions[t]}`).join("\n") : "(none)";

	// Build guidelines based on which tools are actually available
	const guidelinesList: string[] = [];

	const hasBash = tools.includes("bash");
	const hasEdit = tools.includes("edit");
	const hasWrite = tools.includes("write");
	const hasGrep = tools.includes("grep");
	const hasFind = tools.includes("find");
	const hasLs = tools.includes("ls");

	// File exploration guidelines
	if (hasBash && !hasGrep && !hasFind && !hasLs) {
		guidelinesList.push("Use bash for file operations like ls, rg, find");
	} else if (hasBash && (hasGrep || hasFind || hasLs)) {
		guidelinesList.push("Prefer grep/find/ls tools over bash for file exploration (faster, respects .gitignore)");
	}

	// Read before edit guideline
	if (hasRead && hasEdit) {
		guidelinesList.push("Use read to examine files before editing. You must use this tool instead of cat or sed.");
	}

	// Edit guideline
	if (hasEdit) {
		guidelinesList.push("Use edit for precise changes (old text must match exactly)");
	}

	// Write guideline
	if (hasWrite) {
		guidelinesList.push("Use write only for new files or complete rewrites");
	}

	// Output guideline (only when actually writing or executing)
	if (hasEdit || hasWrite) {
		guidelinesList.push(
			"When summarizing your actions, output plain text directly - do NOT use cat or bash to display what you did",
		);
	}

	// Always include these
	guidelinesList.push("Be concise in your responses");
	guidelinesList.push("Show file paths clearly when working with files");

	const guidelines = guidelinesList.map((g) => `- ${g}`).join("\n");

	let prompt =
		customPrompt ??
		`You are an expert coding assistant. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
${toolsList}

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
${guidelines}`;

	if (skillsSection) {
		prompt += skillsSection;
	}

	if (appendSection) {
		prompt += appendSection;
	}

	// Append project context files
	if (contextFiles.length > 0) {
		prompt += "\n\n# Project Context\n\n";
		prompt += "Project-specific instructions and guidelines:\n\n";
		for (const { path: filePath, content } of contextFiles) {
			prompt += `## ${filePath}\n\n${content}\n\n`;
		}
	}

	// Add date/time and working directory last
	prompt += `\nCurrent date and time: ${dateTime}`;
	prompt += `\nCurrent working directory: ${resolvedCwd}`;

	return prompt;
}

function formatSkillsForPrompt(skills: BuildSystemPromptOptions["skills"]): string {
	if (!skills) {
		return "";
	}

	const visibleSkills = Object.entries(skills).filter(([, skill]) => !skill.disableModelInvocation);

	if (visibleSkills.length === 0) {
		return "";
	}

	const lines = [
		"\n\nThe following skills provide specialized instructions for specific tasks.",
		"Use the read tool to load a skill's file when the task matches its description.",
		"When a skill file references a relative path, resolve it against the skill directory (parent of SKILL.md / dirname of the path) and use that absolute path in tool commands.",
		"",
		"<available_skills>",
	];

	for (const [key, skill] of visibleSkills) {
		lines.push("  <skill>");
		lines.push(`    <name>${escapeXml(key)}</name>`);
		lines.push(`    <description>${escapeXml(skill.description)}</description>`);
		lines.push(`    <location>${escapeXml(skill.filePath)}</location>`);
		lines.push("  </skill>");
	}

	lines.push("</available_skills>");
	return lines.join("\n");
}

function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}
