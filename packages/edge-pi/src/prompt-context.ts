/**
 * Shared prompt context types for structured prompt inputs.
 */

export interface ContextFile {
	path: string;
	content: string;
}

export interface Skill {
	description: string;
	filePath: string;
	disableModelInvocation?: boolean;
}
