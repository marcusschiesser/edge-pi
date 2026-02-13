/**
 * Skill loading implementation.
 * Implements the Agent Skills spec: https://agentskills.io/specification
 *
 * Standalone implementation - no dependency on the old SDK.
 */

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import type { Skill as PromptSkill } from "edge-pi";
import { parseFrontmatter } from "./utils/frontmatter.js";

const CONFIG_DIR_NAME = ".pi";

const ALLOWED_FRONTMATTER_FIELDS = new Set([
	"name",
	"description",
	"license",
	"compatibility",
	"metadata",
	"allowed-tools",
	"disable-model-invocation",
]);

const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;

export interface SkillFrontmatter {
	name?: string;
	description?: string;
	"disable-model-invocation"?: boolean;
	[key: string]: unknown;
}

export interface Skill extends PromptSkill {
	name: string;
}

export interface SkillDiagnostic {
	type: "warning" | "collision";
	message: string;
	path: string;
}

export interface LoadSkillsResult {
	skills: Skill[];
	diagnostics: SkillDiagnostic[];
}

function validateName(name: string, parentDirName: string): string[] {
	const errors: string[] = [];
	if (name !== parentDirName) {
		errors.push(`name "${name}" does not match parent directory "${parentDirName}"`);
	}
	if (name.length > MAX_NAME_LENGTH) {
		errors.push(`name exceeds ${MAX_NAME_LENGTH} characters (${name.length})`);
	}
	if (!/^[a-z0-9-]+$/.test(name)) {
		errors.push(`name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)`);
	}
	if (name.startsWith("-") || name.endsWith("-")) {
		errors.push(`name must not start or end with a hyphen`);
	}
	if (name.includes("--")) {
		errors.push(`name must not contain consecutive hyphens`);
	}
	return errors;
}

function validateDescription(description: string | undefined): string[] {
	const errors: string[] = [];
	if (!description || description.trim() === "") {
		errors.push("description is required");
	} else if (description.length > MAX_DESCRIPTION_LENGTH) {
		errors.push(`description exceeds ${MAX_DESCRIPTION_LENGTH} characters (${description.length})`);
	}
	return errors;
}

function validateFrontmatterFields(keys: string[]): string[] {
	const errors: string[] = [];
	for (const key of keys) {
		if (!ALLOWED_FRONTMATTER_FIELDS.has(key)) {
			errors.push(`unknown frontmatter field "${key}"`);
		}
	}
	return errors;
}

function loadSkillFromFile(filePath: string): { skill: Skill | null; diagnostics: SkillDiagnostic[] } {
	const diagnostics: SkillDiagnostic[] = [];

	try {
		const rawContent = readFileSync(filePath, "utf-8");
		const { frontmatter } = parseFrontmatter<SkillFrontmatter>(rawContent);
		const allKeys = Object.keys(frontmatter);
		const skillDir = dirname(filePath);
		const parentDirName = basename(skillDir);

		const fieldErrors = validateFrontmatterFields(allKeys);
		for (const error of fieldErrors) {
			diagnostics.push({ type: "warning", message: error, path: filePath });
		}

		const descErrors = validateDescription(frontmatter.description);
		for (const error of descErrors) {
			diagnostics.push({ type: "warning", message: error, path: filePath });
		}

		const name = frontmatter.name || parentDirName;

		const nameErrors = validateName(name, parentDirName);
		for (const error of nameErrors) {
			diagnostics.push({ type: "warning", message: error, path: filePath });
		}

		if (!frontmatter.description || frontmatter.description.trim() === "") {
			return { skill: null, diagnostics };
		}

		return {
			skill: {
				name,
				description: frontmatter.description,
				filePath,
				disableModelInvocation: frontmatter["disable-model-invocation"] === true,
			},
			diagnostics,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "failed to parse skill file";
		diagnostics.push({ type: "warning", message, path: filePath });
		return { skill: null, diagnostics };
	}
}

function loadSkillsFromDirInternal(dir: string, includeRootFiles: boolean): LoadSkillsResult {
	const skills: Skill[] = [];
	const diagnostics: SkillDiagnostic[] = [];

	if (!existsSync(dir)) {
		return { skills, diagnostics };
	}

	try {
		const entries = readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.name.startsWith(".") || entry.name === "node_modules") {
				continue;
			}

			const fullPath = join(dir, entry.name);

			let isDirectory = entry.isDirectory();
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) {
				try {
					const stats = statSync(fullPath);
					isDirectory = stats.isDirectory();
					isFile = stats.isFile();
				} catch {
					continue;
				}
			}

			if (isDirectory) {
				const subResult = loadSkillsFromDirInternal(fullPath, false);
				skills.push(...subResult.skills);
				diagnostics.push(...subResult.diagnostics);
				continue;
			}

			if (!isFile) continue;

			const isRootMd = includeRootFiles && entry.name.endsWith(".md");
			const isSkillMd = !includeRootFiles && entry.name === "SKILL.md";
			if (!isRootMd && !isSkillMd) continue;

			const result = loadSkillFromFile(fullPath);
			if (result.skill) {
				skills.push(result.skill);
			}
			diagnostics.push(...result.diagnostics);
		}
	} catch {}

	return { skills, diagnostics };
}

export interface LoadSkillsOptions {
	/** Working directory for project-local skills. Default: process.cwd() */
	cwd?: string;
	/** Agent config directory for global skills. Default: ~/.pi/agent */
	agentDir?: string;
	/** Explicit skill paths (files or directories) */
	skillPaths?: string[];
	/** Include default skill directories. Default: true */
	includeDefaults?: boolean;
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

function normalizePath(input: string): string {
	const trimmed = input.trim();
	if (trimmed === "~") return homedir();
	if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
	if (trimmed.startsWith("~")) return join(homedir(), trimmed.slice(1));
	return trimmed;
}

function resolveSkillPath(p: string, cwd: string): string {
	const normalized = normalizePath(p);
	return isAbsolute(normalized) ? normalized : resolve(cwd, normalized);
}

/**
 * Load skills from all configured locations.
 */
export function loadSkills(options: LoadSkillsOptions = {}): LoadSkillsResult {
	const { cwd = process.cwd(), agentDir, skillPaths = [], includeDefaults = true } = options;
	const resolvedAgentDir = agentDir ?? getDefaultAgentDir();

	const skillMap = new Map<string, Skill>();
	const realPathSet = new Set<string>();
	const allDiagnostics: SkillDiagnostic[] = [];
	const collisionDiagnostics: SkillDiagnostic[] = [];

	function addSkills(result: LoadSkillsResult) {
		allDiagnostics.push(...result.diagnostics);
		for (const skill of result.skills) {
			let realPath: string;
			try {
				realPath = realpathSync(skill.filePath);
			} catch {
				realPath = skill.filePath;
			}

			if (realPathSet.has(realPath)) continue;

			const existing = skillMap.get(skill.name);
			if (existing) {
				collisionDiagnostics.push({
					type: "collision",
					message: `name "${skill.name}" collision`,
					path: skill.filePath,
				});
			} else {
				skillMap.set(skill.name, skill);
				realPathSet.add(realPath);
			}
		}
	}

	if (includeDefaults) {
		addSkills(loadSkillsFromDirInternal(join(resolvedAgentDir, "skills"), true));
		addSkills(loadSkillsFromDirInternal(resolve(cwd, CONFIG_DIR_NAME, "skills"), true));
	}

	for (const rawPath of skillPaths) {
		const resolvedPath = resolveSkillPath(rawPath, cwd);
		if (!existsSync(resolvedPath)) {
			allDiagnostics.push({ type: "warning", message: "skill path does not exist", path: resolvedPath });
			continue;
		}

		try {
			const stats = statSync(resolvedPath);
			if (stats.isDirectory()) {
				addSkills(loadSkillsFromDirInternal(resolvedPath, true));
			} else if (stats.isFile() && resolvedPath.endsWith(".md")) {
				const result = loadSkillFromFile(resolvedPath);
				if (result.skill) {
					addSkills({ skills: [result.skill], diagnostics: result.diagnostics });
				} else {
					allDiagnostics.push(...result.diagnostics);
				}
			} else {
				allDiagnostics.push({ type: "warning", message: "skill path is not a markdown file", path: resolvedPath });
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "failed to read skill path";
			allDiagnostics.push({ type: "warning", message, path: resolvedPath });
		}
	}

	return {
		skills: Array.from(skillMap.values()),
		diagnostics: [...allDiagnostics, ...collisionDiagnostics],
	};
}
