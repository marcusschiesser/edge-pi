import type { ToolSet } from "ai";
import type { EdgePiRuntime } from "../runtime/types.js";
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

export interface ToolFactoryOptions {
	cwd: string;
	runtime?: EdgePiRuntime;
}

export function createCodingTools(options: ToolFactoryOptions): ToolSet {
	return {
		read: createReadTool(options),
		bash: createBashTool(options),
		edit: createEditTool(options),
		write: createWriteTool(options),
	};
}

export function createReadOnlyTools(options: ToolFactoryOptions): ToolSet {
	return {
		read: createReadTool(options),
		grep: createGrepTool(options),
		find: createFindTool(options),
		ls: createLsTool(options),
	};
}

export function createAllTools(options: ToolFactoryOptions): ToolSet {
	return {
		read: createReadTool(options),
		bash: createBashTool(options),
		edit: createEditTool(options),
		write: createWriteTool(options),
		grep: createGrepTool(options),
		find: createFindTool(options),
		ls: createLsTool(options),
	};
}
