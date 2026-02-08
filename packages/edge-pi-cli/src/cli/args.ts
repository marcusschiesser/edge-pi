/**
 * CLI argument parsing for edge-pi-cli.
 *
 * Simplified from the original CLI - no RPC, no extensions.
 */

import chalk from "chalk";
import type { ThinkingLevel } from "edge-pi";
import { getLatestModels, listProviders } from "../model-factory.js";

export type Mode = "text" | "json";

const VALID_THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high"]);

export interface Args {
	provider?: string;
	model?: string;
	apiKey?: string;
	systemPrompt?: string;
	appendSystemPrompt?: string;
	thinking?: ThinkingLevel;
	continue?: boolean;
	resume?: boolean;
	help?: boolean;
	version?: boolean;
	listModels?: boolean;
	mode?: Mode;
	noSession?: boolean;
	session?: string;
	sessionDir?: string;
	toolSet?: "coding" | "readonly" | "all";
	noSkills?: boolean;
	skills?: string[];
	print?: boolean;
	verbose?: boolean;
	messages: string[];
	fileArgs: string[];
}

export function parseArgs(args: string[]): Args {
	const result: Args = {
		messages: [],
		fileArgs: [],
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--help" || arg === "-h") {
			result.help = true;
		} else if (arg === "--version" || arg === "-v") {
			result.version = true;
		} else if (arg === "--list-models") {
			result.listModels = true;
		} else if (arg === "--mode" && i + 1 < args.length) {
			const mode = args[++i];
			if (mode === "text" || mode === "json") {
				result.mode = mode;
			}
		} else if (arg === "--continue" || arg === "-c") {
			result.continue = true;
		} else if (arg === "--resume" || arg === "-r") {
			result.resume = true;
		} else if (arg === "--provider" && i + 1 < args.length) {
			result.provider = args[++i];
		} else if (arg === "--model" && i + 1 < args.length) {
			result.model = args[++i];
		} else if (arg === "--api-key" && i + 1 < args.length) {
			result.apiKey = args[++i];
		} else if (arg === "--system-prompt" && i + 1 < args.length) {
			result.systemPrompt = args[++i];
		} else if (arg === "--append-system-prompt" && i + 1 < args.length) {
			result.appendSystemPrompt = args[++i];
		} else if (arg === "--no-session") {
			result.noSession = true;
		} else if (arg === "--session" && i + 1 < args.length) {
			result.session = args[++i];
		} else if (arg === "--session-dir" && i + 1 < args.length) {
			result.sessionDir = args[++i];
		} else if (arg === "--tools" && i + 1 < args.length) {
			const toolSet = args[++i];
			if (toolSet === "coding" || toolSet === "readonly" || toolSet === "all") {
				result.toolSet = toolSet;
			} else {
				console.error(chalk.yellow(`Warning: Invalid tool set "${toolSet}". Valid values: coding, readonly, all`));
			}
		} else if (arg === "--thinking" && i + 1 < args.length) {
			const level = args[++i];
			if (VALID_THINKING_LEVELS.has(level)) {
				result.thinking = level as ThinkingLevel;
			} else {
				console.error(
					chalk.yellow(
						`Warning: Invalid thinking level "${level}". Valid values: ${[...VALID_THINKING_LEVELS].join(", ")}`,
					),
				);
			}
		} else if (arg === "--print" || arg === "-p") {
			result.print = true;
		} else if (arg === "--skill" && i + 1 < args.length) {
			result.skills = result.skills ?? [];
			result.skills.push(args[++i]);
		} else if (arg === "--no-skills") {
			result.noSkills = true;
		} else if (arg === "--verbose") {
			result.verbose = true;
		} else if (arg.startsWith("@")) {
			result.fileArgs.push(arg.slice(1));
		} else if (!arg.startsWith("-")) {
			result.messages.push(arg);
		}
	}

	return result;
}

export function printHelp(): void {
	console.log(`${chalk.bold("epi")} - CLI for the edge-pi coding agent SDK

${chalk.bold("Usage:")}
  epi [options] [@files...] [messages...]

${chalk.bold("Options:")}
  --provider <name>              Provider name (${listProviders().join(", ")})
  --model <id>                   Model ID (auto-detected from provider)
  --api-key <key>                API key (defaults to env vars)
  --system-prompt <text>         Override the system prompt
  --append-system-prompt <text>  Append text to the system prompt
  --mode <mode>                  Output mode: text (default) or json
  --print, -p                    Non-interactive mode: process prompt and exit
  --continue, -c                 Continue previous session
  --resume, -r                   Select and resume a previous session
  --session <path>               Use specific session file
  --session-dir <dir>            Directory for session storage
  --no-session                   Don't save session (ephemeral)
  --tools <set>                  Tool set: coding (default), readonly, or all
  --thinking <level>             Thinking level: off, minimal, low, medium, high
  --skill <path>                 Load a skill file or directory (repeatable)
  --no-skills                    Disable skill discovery and loading
  --verbose                      Verbose output
  --list-models                  List latest supported models
  --help, -h                     Show this help
  --version, -v                  Show version number

${chalk.bold("Examples:")}
  # Interactive mode
  epi

  # Interactive mode with initial prompt
  epi "List all .ts files in src/"

  # Include files in initial message
  epi @prompt.md "Refactor this"

  # Non-interactive mode (process and exit)
  epi -p "List all .ts files in src/"

  # Continue previous session
  epi --continue "What did we discuss?"

  # Resume a previous session (interactive picker)
  epi --resume

  # Use specific latest models
  epi --provider anthropic --model claude-opus-4-6
  epi --provider openai --model gpt-5.3
  epi --provider google --model gemini-3-flash
  epi --provider github-copilot --model claude-sonnet-4.5

  # Read-only tools
  epi --tools readonly -p "Review the code in src/"

${chalk.bold("Environment Variables:")}
  ANTHROPIC_API_KEY       Anthropic Claude API key
  OPENAI_API_KEY          OpenAI GPT API key
  GEMINI_API_KEY          Google Gemini API key
  COPILOT_GITHUB_TOKEN    GitHub Copilot token (or GH_TOKEN / GITHUB_TOKEN)

${chalk.bold("Tool Sets:")}
  coding    read, bash, edit, write (default)
  readonly  read, grep, find, ls
  all       read, bash, edit, write, grep, find, ls
`);
}

export function printModels(): void {
	const latestModels = getLatestModels();

	console.log(`${chalk.bold("Latest Supported Models:")}\n`);

	for (const [provider, models] of Object.entries(latestModels)) {
		console.log(`${chalk.bold(provider.toUpperCase())}:`);
		for (const model of models) {
			console.log(`  ${model}`);
		}
		console.log();
	}

	console.log(`${chalk.bold("Usage:")}
  epi --provider <provider> --model <model> [message...]

${chalk.bold("Examples:")}
  epi --provider anthropic --model claude-opus-4-6 "Hello"
  epi --provider openai --model gpt-5.3 "Hello"
  epi --provider google --model gemini-3-flash "Hello"
  epi --provider github-copilot --model claude-sonnet-4.5 "Hello"
`);
}
