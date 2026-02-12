import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const EDGE_PI_REPO_URL = "https://github.com/marcusschiesser/edge-pi.git";
const EDGE_PI_SOURCE_DIR_ENV = "EPI_SOURCE_DIR";
const EDGE_PI_NO_UPDATE_ENV = "EPI_NO_UPDATE";

type RunResult = {
	code: number;
	stdout: string;
	stderr: string;
};

type UpdatePolicy = "update" | "skip-dirty" | "skip-branch" | "skip-env";

function runCommand(command: string, args: string[], cwd?: string): RunResult {
	const result = spawnSync(command, args, {
		cwd,
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	});

	return {
		code: result.status ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
}

function runGit(args: string[], cwd: string): RunResult {
	return runCommand("git", args, cwd);
}

export function resolveSourceDir(env: NodeJS.ProcessEnv): string {
	const override = env[EDGE_PI_SOURCE_DIR_ENV];
	if (override && override.trim().length > 0) {
		return override;
	}
	return join(homedir(), ".edge-pi", "source");
}

export function computeUpdatePolicy(env: NodeJS.ProcessEnv, branch: string, isDirty: boolean): UpdatePolicy {
	if (env[EDGE_PI_NO_UPDATE_ENV] === "1") {
		return "skip-env";
	}
	if (isDirty) {
		return "skip-dirty";
	}
	if (branch !== "main") {
		return "skip-branch";
	}
	return "update";
}

function ensureRepositoryExists(sourceDir: string): void {
	if (existsSync(join(sourceDir, ".git"))) {
		return;
	}

	mkdirSync(sourceDir, { recursive: true });
	const cloneResult = runCommand("git", ["clone", EDGE_PI_REPO_URL, sourceDir]);
	if (cloneResult.code !== 0) {
		throw new Error(`Failed to clone edge-pi repository: ${cloneResult.stderr || cloneResult.stdout}`);
	}
}

function updateRepository(sourceDir: string, env: NodeJS.ProcessEnv): void {
	const branchResult = runGit(["rev-parse", "--abbrev-ref", "HEAD"], sourceDir);
	if (branchResult.code !== 0) {
		console.error("epi: could not determine branch in source checkout; continuing without update.");
		return;
	}

	const dirtyResult = runGit(["status", "--porcelain"], sourceDir);
	if (dirtyResult.code !== 0) {
		console.error("epi: could not determine working tree state in source checkout; continuing without update.");
		return;
	}

	const branch = branchResult.stdout.trim();
	const isDirty = dirtyResult.stdout.trim().length > 0;
	const policy = computeUpdatePolicy(env, branch, isDirty);

	if (policy === "skip-env") {
		return;
	}
	if (policy === "skip-dirty") {
		console.error("epi: local modifications detected; skipped update and using local source checkout.");
		return;
	}
	if (policy === "skip-branch") {
		console.error(
			`epi: source checkout is on '${branch}', not 'main'; skipped update and using local source checkout.`,
		);
		return;
	}

	const fetchResult = runGit(["fetch", "origin", "main", "--prune"], sourceDir);
	if (fetchResult.code !== 0) {
		console.error("epi: failed to fetch latest main; using local source checkout.");
		return;
	}

	const pullResult = runGit(["pull", "--ff-only", "origin", "main"], sourceDir);
	if (pullResult.code !== 0) {
		console.error("epi: failed to fast-forward main; using local source checkout.");
	}
}

export function runCliFromSource(args: string[], env: NodeJS.ProcessEnv): number {
	const sourceDir = resolveSourceDir(env);
	ensureRepositoryExists(sourceDir);
	updateRepository(sourceDir, env);

	const result = spawnSync("npx", ["tsx", "packages/edge-pi-cli/src/main.ts", ...args], {
		cwd: sourceDir,
		stdio: "inherit",
		env,
	});

	if (result.error) {
		console.error(`epi: failed to execute source CLI: ${result.error.message}`);
		return 1;
	}

	return result.status ?? 1;
}
