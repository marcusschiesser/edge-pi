/**
 * Main entry point for the edge-pi CLI.
 *
 * Handles argument parsing, model creation, skill loading,
 * session management, auth, and mode dispatch.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import chalk from "chalk";
import type { CodingAgentConfig, ModelMessage } from "edge-pi";
import { CodingAgent, SessionManager } from "edge-pi";
import { AuthStorage, anthropicOAuthProvider } from "./auth/index.js";
import { parseArgs, printHelp } from "./cli/args.js";
import { createModel } from "./model-factory.js";
import { runInteractiveMode } from "./modes/interactive-mode.js";
import { runPrintMode } from "./modes/print-mode.js";
import { formatSkillsForPrompt, loadSkills, type Skill } from "./skills.js";

const VERSION = "0.1.0";
const CONFIG_DIR_NAME = ".pi";

function getAgentDir(): string {
	const envDir = process.env.PI_CODING_AGENT_DIR;
	if (envDir) {
		if (envDir === "~") return homedir();
		if (envDir.startsWith("~/")) return homedir() + envDir.slice(1);
		return envDir;
	}
	return join(homedir(), CONFIG_DIR_NAME, "agent");
}

function getSessionsDir(): string {
	return join(getAgentDir(), "sessions");
}

function getAuthPath(): string {
	return join(getAgentDir(), "auth.json");
}

/**
 * Read all content from piped stdin.
 * Returns undefined if stdin is a TTY.
 */
async function readPipedStdin(): Promise<string | undefined> {
	if (process.stdin.isTTY) {
		return undefined;
	}
	return new Promise((resolve) => {
		let data = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => {
			data += chunk;
		});
		process.stdin.on("end", () => {
			resolve(data.trim() || undefined);
		});
		process.stdin.resume();
	});
}

/**
 * Process @file arguments into text content.
 */
function processFileArgs(fileArgs: string[]): string {
	const parts: string[] = [];
	for (const filePath of fileArgs) {
		const resolved = resolve(filePath);
		if (!existsSync(resolved)) {
			console.error(chalk.yellow(`Warning: File not found: ${resolved}`));
			continue;
		}
		try {
			const content = readFileSync(resolved, "utf-8");
			parts.push(`<file path="${resolved}">\n${content}\n</file>`);
		} catch (error) {
			console.error(chalk.yellow(`Warning: Could not read ${resolved}: ${(error as Error).message}`));
		}
	}
	return parts.length > 0 ? `${parts.join("\n\n")}\n\n` : "";
}

/**
 * Create a session directory path based on the current working directory.
 */
function getProjectSessionDir(cwd: string): string {
	const sanitized = cwd.replace(/\//g, "--").replace(/^--/, "");
	return join(getSessionsDir(), sanitized);
}

/**
 * Find the most recent session file in a directory.
 */
function findRecentSession(sessionDir: string): string | undefined {
	if (!existsSync(sessionDir)) return undefined;
	try {
		const files = readdirSync(sessionDir)
			.filter((f: string) => f.endsWith(".jsonl"))
			.map((f: string) => ({
				name: f,
				path: join(sessionDir, f),
				mtime: statSync(join(sessionDir, f)).mtime.getTime(),
			}))
			.sort((a: { mtime: number }, b: { mtime: number }) => b.mtime - a.mtime);
		return files[0]?.path;
	} catch {
		return undefined;
	}
}

/**
 * Create and configure AuthStorage with built-in OAuth providers.
 */
function createAuthStorage(): AuthStorage {
	const authStorage = new AuthStorage(getAuthPath());
	authStorage.registerProvider(anthropicOAuthProvider);
	return authStorage;
}

export async function main(args: string[]) {
	const parsed = parseArgs(args);

	if (parsed.version) {
		console.log(VERSION);
		return;
	}

	if (parsed.help) {
		printHelp();
		return;
	}

	// Read piped stdin
	const stdinContent = await readPipedStdin();
	if (stdinContent !== undefined) {
		parsed.print = true;
		parsed.messages.unshift(stdinContent);
	}

	// Process @file arguments
	let initialMessage: string | undefined;
	if (parsed.fileArgs.length > 0) {
		const fileContent = processFileArgs(parsed.fileArgs);
		if (parsed.messages.length > 0) {
			initialMessage = fileContent + parsed.messages.shift();
		} else {
			initialMessage = fileContent;
		}
	}

	const cwd = process.cwd();
	const isInteractive = !parsed.print && parsed.mode === undefined;
	const mode = parsed.mode || "text";

	// Set up auth storage
	const authStorage = createAuthStorage();

	// Apply CLI --api-key override
	if (parsed.apiKey && parsed.provider) {
		authStorage.setRuntimeApiKey(parsed.provider, parsed.apiKey);
	}

	// Create model (async - may resolve OAuth tokens)
	const { model, provider, modelId } = await createModel({
		provider: parsed.provider,
		model: parsed.model,
		apiKey: parsed.apiKey,
		authStorage,
	});

	// Load skills
	let skills: Skill[] = [];
	if (!parsed.noSkills) {
		const skillResult = loadSkills({
			cwd,
			skillPaths: parsed.skills,
			includeDefaults: true,
		});
		skills = skillResult.skills;

		if (parsed.verbose && skillResult.diagnostics.length > 0) {
			for (const d of skillResult.diagnostics) {
				console.error(chalk.yellow(`Skill warning: ${d.message} (${d.path})`));
			}
		}
	}

	// Build system prompt additions
	const skillsPrompt = formatSkillsForPrompt(skills);
	const appendParts: string[] = [];
	if (skillsPrompt) {
		appendParts.push(skillsPrompt);
	}
	if (parsed.appendSystemPrompt) {
		appendParts.push(parsed.appendSystemPrompt);
	}
	const appendSystemPrompt = appendParts.length > 0 ? appendParts.join("\n\n") : undefined;

	// Set up session manager
	let sessionManager: SessionManager | undefined;
	if (parsed.noSession) {
		sessionManager = SessionManager.inMemory(cwd);
	} else if (parsed.session) {
		sessionManager = SessionManager.open(parsed.session, parsed.sessionDir);
	} else if (parsed.continue) {
		const sessionDir = parsed.sessionDir ?? getProjectSessionDir(cwd);
		const recentFile = findRecentSession(sessionDir);
		if (recentFile) {
			sessionManager = SessionManager.open(recentFile, sessionDir);
		} else {
			if (parsed.verbose) {
				console.log(chalk.dim("No previous session found, starting new."));
			}
			sessionManager = SessionManager.create(cwd, sessionDir);
		}
	} else {
		const sessionDir = parsed.sessionDir ?? getProjectSessionDir(cwd);
		sessionManager = SessionManager.create(cwd, sessionDir);
	}

	// Restore messages from session if continuing
	let restoredMessages: ModelMessage[] = [];
	if (parsed.continue && sessionManager) {
		const context = sessionManager.buildSessionContext();
		restoredMessages = context.messages;
	}

	// Create agent config
	const agentConfig: CodingAgentConfig = {
		model,
		cwd,
		maxSteps: parsed.maxSteps ?? 50,
		toolSet: parsed.toolSet ?? "coding",
		thinkingLevel: parsed.thinking,
	};

	if (parsed.systemPrompt) {
		agentConfig.systemPrompt = parsed.systemPrompt;
		if (appendSystemPrompt) {
			agentConfig.systemPrompt += `\n\n${appendSystemPrompt}`;
		}
	} else {
		agentConfig.systemPromptOptions = {
			appendSystemPrompt,
		};
	}

	// Create agent
	const agent = new CodingAgent(agentConfig);

	// Restore session messages
	if (restoredMessages.length > 0) {
		agent.setMessages(restoredMessages);
		if (parsed.verbose) {
			console.log(chalk.dim(`Restored ${restoredMessages.length} messages from session.`));
		}
	}

	// Dispatch to mode
	if (isInteractive) {
		await runInteractiveMode(agent, {
			initialMessage,
			initialMessages: parsed.messages,
			sessionManager,
			skills,
			verbose: parsed.verbose,
			provider,
			modelId,
			authStorage,
		});
	} else {
		await runPrintMode(agent, {
			mode,
			messages: parsed.messages,
			initialMessage,
			sessionManager,
		});
		process.exit(0);
	}
}
