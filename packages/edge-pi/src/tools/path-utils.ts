/**
 * Path resolution utilities for tools.
 */

import type { EdgePiRuntime } from "../runtime/types.js";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const NARROW_NO_BREAK_SPACE = "\u202F";

function normalizeUnicodeSpaces(str: string): string {
	return str.replace(UNICODE_SPACES, " ");
}

function tryMacOSScreenshotPath(filePath: string): string {
	return filePath.replace(/ (AM|PM)\./g, `${NARROW_NO_BREAK_SPACE}$1.`);
}

function tryNFDVariant(filePath: string): string {
	return filePath.normalize("NFD");
}

function tryCurlyQuoteVariant(filePath: string): string {
	return filePath.replace(/'/g, "\u2019");
}

async function fileExists(filePath: string, runtime: EdgePiRuntime): Promise<boolean> {
	return runtime.fs.exists(filePath);
}

export function expandPath(filePath: string, runtime: EdgePiRuntime): string {
	const normalized = normalizeUnicodeSpaces(filePath);
	if (normalized === "~") {
		return runtime.rootdir;
	}
	if (normalized.startsWith("~/")) {
		return runtime.rootdir + normalized.slice(1);
	}
	return normalized;
}

/**
 * Resolve the configured working directory into a canonical absolute path.
 *
 * This is step 1 of path resolution: establish a stable base directory that
 * tools can use for all subsequent path argument resolution.
 */
export function resolveCwd(cwd: string, runtime: EdgePiRuntime): string {
	return runtime.resolveWorkspacePath(expandPath(cwd, runtime));
}

/**
 * Resolve an input path relative to the canonical working directory.
 *
 * This is step 2 of path resolution: after `resolveCwd` defines the base,
 * tool-specific file/dir arguments are resolved consistently against it.
 */
export function resolveToCwd(filePath: string, cwd: string, runtime: EdgePiRuntime): string {
	const resolvedCwd = resolveCwd(cwd, runtime);
	return runtime.resolveWorkspacePath(expandPath(filePath, runtime), { cwd: resolvedCwd });
}

export async function resolveReadPath(filePath: string, cwd: string, runtime: EdgePiRuntime): Promise<string> {
	const resolved = resolveToCwd(filePath, cwd, runtime);

	if (await fileExists(resolved, runtime)) {
		return resolved;
	}

	const amPmVariant = tryMacOSScreenshotPath(resolved);
	if (amPmVariant !== resolved && (await fileExists(amPmVariant, runtime))) {
		return amPmVariant;
	}

	const nfdVariant = tryNFDVariant(resolved);
	if (nfdVariant !== resolved && (await fileExists(nfdVariant, runtime))) {
		return nfdVariant;
	}

	const curlyVariant = tryCurlyQuoteVariant(resolved);
	if (curlyVariant !== resolved && (await fileExists(curlyVariant, runtime))) {
		return curlyVariant;
	}

	const nfdCurlyVariant = tryCurlyQuoteVariant(nfdVariant);
	if (nfdCurlyVariant !== resolved && (await fileExists(nfdCurlyVariant, runtime))) {
		return nfdCurlyVariant;
	}

	return resolved;
}
