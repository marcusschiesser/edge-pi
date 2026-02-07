/**
 * Find the `fd` binary for file path autocomplete.
 *
 * Checks:
 * 1. System PATH
 * 2. ~/.pi/agent/bin/fd (installed by pi-coding-agent)
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Find the fd binary path, or return undefined if not available.
 */
export function findFd(): string | undefined {
	// Check system PATH
	try {
		const result = spawnSync("fd", ["--version"], { stdio: "pipe", encoding: "utf-8" });
		if (result.error === undefined || result.error === null) {
			return "fd";
		}
	} catch {
		// not in PATH
	}

	// Check ~/.pi/agent/bin/fd
	const piPath = join(homedir(), ".pi", "agent", "bin", "fd");
	if (existsSync(piPath)) {
		return piPath;
	}

	return undefined;
}
