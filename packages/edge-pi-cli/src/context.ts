/**
 * Context file loading for the system prompt.
 *
 * Loads AGENTS.md files from the current working directory and parent
 * directories, following the convention from the coding-agent.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface ContextFile {
	path: string;
	content: string;
}

/**
 * Load AGENTS.md context files by walking up from `cwd` to the filesystem root.
 * Files closer to the root are returned first (broadest context first).
 */
export function loadContextFiles(cwd: string): ContextFile[] {
	const files: ContextFile[] = [];
	let dir = resolve(cwd);

	while (true) {
		const agentsFile = join(dir, "AGENTS.md");
		if (existsSync(agentsFile)) {
			try {
				const content = readFileSync(agentsFile, "utf-8").trim();
				if (content) {
					files.push({ path: agentsFile, content });
				}
			} catch {
				// skip unreadable files
			}
		}

		const parent = dirname(dir);
		if (parent === dir) break; // reached root
		dir = parent;
	}

	// Reverse so broadest context (root) comes first
	files.reverse();
	return files;
}
