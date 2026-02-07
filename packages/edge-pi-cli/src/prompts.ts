/**
 * Prompt template loading and expansion.
 *
 * Loads prompt templates from:
 * - ~/.pi/agent/prompts/ (user-level)
 * - .pi/prompts/ (project-level)
 *
 * Prompt templates are markdown files with frontmatter containing a
 * "description" field. The filename (without .md) becomes the command name.
 * They are invoked via /name in the editor and expand to the file body.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { parseFrontmatter } from "./utils/frontmatter.js";

const CONFIG_DIR_NAME = ".pi";

export interface PromptTemplate {
	/** Command name (filename without .md extension) */
	name: string;
	/** Description from frontmatter */
	description: string;
	/** Full file path */
	filePath: string;
	/** The body content (after frontmatter) */
	body: string;
	/** Source: "user" or "project" */
	source: "user" | "project";
}

export interface PromptFrontmatter {
	description?: string;
	[key: string]: unknown;
}

export interface LoadPromptsResult {
	prompts: PromptTemplate[];
	diagnostics: Array<{ type: "warning" | "collision"; message: string; path: string }>;
}

function getDefaultAgentDir(): string {
	const envDir = process.env.PI_CODING_AGENT_DIR;
	if (envDir) {
		if (envDir === "~") return homedir();
		if (envDir.startsWith("~/")) return homedir() + envDir.slice(1);
		return envDir;
	}
	return join(homedir(), CONFIG_DIR_NAME, "agent");
}

function loadPromptsFromDir(dir: string, source: "user" | "project"): LoadPromptsResult {
	const prompts: PromptTemplate[] = [];
	const diagnostics: LoadPromptsResult["diagnostics"] = [];

	if (!existsSync(dir)) {
		return { prompts, diagnostics };
	}

	try {
		const entries = readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.name.startsWith(".") || !entry.name.endsWith(".md")) continue;

			const fullPath = join(dir, entry.name);

			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) {
				try {
					isFile = statSync(fullPath).isFile();
				} catch {
					continue;
				}
			}
			if (!isFile) continue;

			try {
				const rawContent = readFileSync(fullPath, "utf-8");
				const { frontmatter, body } = parseFrontmatter<PromptFrontmatter>(rawContent);
				const name = basename(entry.name, ".md");

				if (!frontmatter.description || frontmatter.description.trim() === "") {
					diagnostics.push({
						type: "warning",
						message: "prompt template missing description in frontmatter",
						path: fullPath,
					});
					continue;
				}

				prompts.push({
					name,
					description: frontmatter.description,
					filePath: fullPath,
					body: body.trim(),
					source,
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : "failed to parse prompt template";
				diagnostics.push({ type: "warning", message, path: fullPath });
			}
		}
	} catch {
		// directory not readable
	}

	return { prompts, diagnostics };
}

export interface LoadPromptsOptions {
	/** Working directory for project-local prompts. Default: process.cwd() */
	cwd?: string;
	/** Agent config directory. Default: ~/.pi/agent */
	agentDir?: string;
}

/**
 * Load prompt templates from user and project directories.
 * Project prompts override user prompts with the same name.
 */
export function loadPrompts(options: LoadPromptsOptions = {}): LoadPromptsResult {
	const { cwd = process.cwd(), agentDir } = options;
	const resolvedAgentDir = agentDir ?? getDefaultAgentDir();

	const allDiagnostics: LoadPromptsResult["diagnostics"] = [];
	const promptMap = new Map<string, PromptTemplate>();

	// Load user-level prompts first
	const userResult = loadPromptsFromDir(join(resolvedAgentDir, "prompts"), "user");
	allDiagnostics.push(...userResult.diagnostics);
	for (const prompt of userResult.prompts) {
		promptMap.set(prompt.name, prompt);
	}

	// Load project-level prompts (override user-level)
	const projectResult = loadPromptsFromDir(resolve(cwd, CONFIG_DIR_NAME, "prompts"), "project");
	allDiagnostics.push(...projectResult.diagnostics);
	for (const prompt of projectResult.prompts) {
		if (promptMap.has(prompt.name)) {
			allDiagnostics.push({
				type: "collision",
				message: `prompt "${prompt.name}" overrides user-level prompt`,
				path: prompt.filePath,
			});
		}
		promptMap.set(prompt.name, prompt);
	}

	return {
		prompts: Array.from(promptMap.values()),
		diagnostics: allDiagnostics,
	};
}

/**
 * Expand prompt template references in user input.
 * If the input starts with /name and matches a template, replace with the template body.
 * Returns the original text if no template matches.
 */
export function expandPromptTemplate(text: string, templates: PromptTemplate[]): string {
	if (!text.startsWith("/")) return text;

	// Extract command name (first word after /)
	const spaceIndex = text.indexOf(" ");
	const commandName = spaceIndex === -1 ? text.slice(1) : text.slice(1, spaceIndex);
	const remainder = spaceIndex === -1 ? "" : text.slice(spaceIndex);

	const template = templates.find((t) => t.name === commandName);
	if (!template) return text;

	return template.body + remainder;
}
