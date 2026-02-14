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
		return runtime.os.homedir();
	}
	if (normalized.startsWith("~/")) {
		return runtime.os.homedir() + normalized.slice(1);
	}
	return normalized;
}

export function resolveToCwd(filePath: string, cwd: string, runtime: EdgePiRuntime): string {
	const expanded = expandPath(filePath, runtime);
	if (runtime.path.isAbsolute(expanded)) {
		return expanded;
	}
	return runtime.path.resolve(cwd, expanded);
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
