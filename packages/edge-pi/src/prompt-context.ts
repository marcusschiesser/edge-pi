/**
 * Shared prompt context types for structured prompt inputs.
 */

export interface ContextFile {
	path: string;
	content: string;
}

export interface Skill {
	name: string;
	description: string;
	filePath: string;
	baseDir: string;
	source: string;
	disableModelInvocation: boolean;
}
