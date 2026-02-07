/**
 * Tool factory functions returning Vercel AI ToolSet.
 */

import type { ToolSet } from "ai";
import { createBashTool } from "./bash.js";
import { createEditTool } from "./edit.js";
import { createFindTool } from "./find.js";
import { createGrepTool } from "./grep.js";
import { createLsTool } from "./ls.js";
import { createReadTool } from "./read.js";
import { createWriteTool } from "./write.js";

export { createBashTool } from "./bash.js";
export { createEditTool } from "./edit.js";
export { createFindTool } from "./find.js";
export { createGrepTool } from "./grep.js";
export { createLsTool } from "./ls.js";
export { createReadTool } from "./read.js";
export { createWriteTool } from "./write.js";

/**
 * Create coding tools (read, bash, edit, write) configured for a specific working directory.
 */
export function createCodingTools(cwd: string): ToolSet {
	return {
		read: createReadTool(cwd),
		bash: createBashTool(cwd),
		edit: createEditTool(cwd),
		write: createWriteTool(cwd),
	};
}

/**
 * Create read-only tools (read, grep, find, ls) configured for a specific working directory.
 */
export function createReadOnlyTools(cwd: string): ToolSet {
	return {
		read: createReadTool(cwd),
		grep: createGrepTool(cwd),
		find: createFindTool(cwd),
		ls: createLsTool(cwd),
	};
}

/**
 * Create all tools configured for a specific working directory.
 */
export function createAllTools(cwd: string): ToolSet {
	return {
		read: createReadTool(cwd),
		bash: createBashTool(cwd),
		edit: createEditTool(cwd),
		write: createWriteTool(cwd),
		grep: createGrepTool(cwd),
		find: createFindTool(cwd),
		ls: createLsTool(cwd),
	};
}
