/**
 * Clipboard image reading utility.
 *
 * Reads image data from the system clipboard using OS-native tools:
 * - macOS: `pngpaste` or `osascript` (AppleScript)
 * - Linux/Wayland: `wl-paste`
 * - Linux/X11: `xclip`
 */

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface ClipboardImage {
	bytes: Uint8Array;
	mimeType: string;
}

const SUPPORTED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;

const DEFAULT_LIST_TIMEOUT_MS = 1000;
const DEFAULT_READ_TIMEOUT_MS = 3000;
const DEFAULT_MAX_BUFFER_BYTES = 50 * 1024 * 1024;

export function extensionForImageMimeType(mimeType: string): string | null {
	const base = mimeType.split(";")[0]?.trim().toLowerCase() ?? mimeType.toLowerCase();
	switch (base) {
		case "image/png":
			return "png";
		case "image/jpeg":
			return "jpg";
		case "image/webp":
			return "webp";
		case "image/gif":
			return "gif";
		default:
			return null;
	}
}

function baseMimeType(mimeType: string): string {
	return mimeType.split(";")[0]?.trim().toLowerCase() ?? mimeType.toLowerCase();
}

function selectPreferredImageMimeType(mimeTypes: string[]): string | null {
	const normalized = mimeTypes
		.map((t) => t.trim())
		.filter(Boolean)
		.map((t) => ({ raw: t, base: baseMimeType(t) }));

	for (const preferred of SUPPORTED_IMAGE_MIME_TYPES) {
		const match = normalized.find((t) => t.base === preferred);
		if (match) return match.raw;
	}

	const anyImage = normalized.find((t) => t.base.startsWith("image/"));
	return anyImage?.raw ?? null;
}

function isWaylandSession(env: NodeJS.ProcessEnv = process.env): boolean {
	return Boolean(env.WAYLAND_DISPLAY) || env.XDG_SESSION_TYPE === "wayland";
}

function runCommand(
	command: string,
	args: string[],
	options?: { timeoutMs?: number; maxBufferBytes?: number },
): { stdout: Buffer; ok: boolean } {
	const timeoutMs = options?.timeoutMs ?? DEFAULT_READ_TIMEOUT_MS;
	const maxBufferBytes = options?.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES;

	const result = spawnSync(command, args, {
		timeout: timeoutMs,
		maxBuffer: maxBufferBytes,
	});

	if (result.error || result.status !== 0) {
		return { ok: false, stdout: Buffer.alloc(0) };
	}

	const stdout = Buffer.isBuffer(result.stdout)
		? result.stdout
		: Buffer.from(result.stdout ?? "", typeof result.stdout === "string" ? "utf-8" : undefined);

	return { ok: true, stdout };
}

function readClipboardImageViaWlPaste(): ClipboardImage | null {
	const list = runCommand("wl-paste", ["--list-types"], { timeoutMs: DEFAULT_LIST_TIMEOUT_MS });
	if (!list.ok) return null;

	const types = list.stdout
		.toString("utf-8")
		.split(/\r?\n/)
		.map((t) => t.trim())
		.filter(Boolean);

	const selectedType = selectPreferredImageMimeType(types);
	if (!selectedType) return null;

	const data = runCommand("wl-paste", ["--type", selectedType, "--no-newline"]);
	if (!data.ok || data.stdout.length === 0) return null;

	return { bytes: data.stdout, mimeType: baseMimeType(selectedType) };
}

function readClipboardImageViaXclip(): ClipboardImage | null {
	const targets = runCommand("xclip", ["-selection", "clipboard", "-t", "TARGETS", "-o"], {
		timeoutMs: DEFAULT_LIST_TIMEOUT_MS,
	});

	let candidateTypes: string[] = [];
	if (targets.ok) {
		candidateTypes = targets.stdout
			.toString("utf-8")
			.split(/\r?\n/)
			.map((t) => t.trim())
			.filter(Boolean);
	}

	const preferred = candidateTypes.length > 0 ? selectPreferredImageMimeType(candidateTypes) : null;
	const tryTypes = preferred ? [preferred, ...SUPPORTED_IMAGE_MIME_TYPES] : [...SUPPORTED_IMAGE_MIME_TYPES];

	for (const mimeType of tryTypes) {
		const data = runCommand("xclip", ["-selection", "clipboard", "-t", mimeType, "-o"]);
		if (data.ok && data.stdout.length > 0) {
			return { bytes: data.stdout, mimeType: baseMimeType(mimeType) };
		}
	}

	return null;
}

function readClipboardImageViaPngpaste(): ClipboardImage | null {
	const tmpFile = join(tmpdir(), `epi-clipboard-check-${randomUUID()}.png`);
	try {
		const result = spawnSync("pngpaste", [tmpFile], { timeout: DEFAULT_READ_TIMEOUT_MS });
		if (result.status !== 0 || !existsSync(tmpFile)) return null;
		const bytes = readFileSync(tmpFile);
		if (bytes.length === 0) return null;
		return { bytes, mimeType: "image/png" };
	} catch {
		return null;
	} finally {
		try {
			unlinkSync(tmpFile);
		} catch {
			// ignore
		}
	}
}

function readClipboardImageViaOsascript(): ClipboardImage | null {
	const tmpFile = join(tmpdir(), `epi-clipboard-check-${randomUUID()}.png`);
	try {
		// Check if clipboard contains an image
		const checkScript = 'tell application "System Events" to return (clipboard info) as text';
		const infoResult = spawnSync("osascript", ["-e", checkScript], { timeout: DEFAULT_LIST_TIMEOUT_MS });
		if (infoResult.status !== 0) return null;
		const info = infoResult.stdout?.toString("utf-8") ?? "";
		if (!info.includes("PICTure") && !info.includes("TIFF") && !info.includes("PNG")) return null;

		// Write clipboard image to temp file via AppleScript
		const writeScript = [
			"try",
			`  set imgData to the clipboard as «class PNGf»`,
			`  set fp to open for access POSIX file "${tmpFile}" with write permission`,
			"  write imgData to fp",
			"  close access fp",
			"on error",
			"  try",
			`    close access POSIX file "${tmpFile}"`,
			"  end try",
			"  error number -1",
			"end try",
		].join("\n");

		const result = spawnSync("osascript", ["-e", writeScript], { timeout: DEFAULT_READ_TIMEOUT_MS });
		if (result.status !== 0 || !existsSync(tmpFile)) return null;
		const bytes = readFileSync(tmpFile);
		if (bytes.length === 0) return null;
		return { bytes, mimeType: "image/png" };
	} catch {
		return null;
	} finally {
		try {
			unlinkSync(tmpFile);
		} catch {
			// ignore
		}
	}
}

/**
 * Read an image from the system clipboard.
 * Returns null if no image is available or clipboard access fails.
 */
export function readClipboardImage(): ClipboardImage | null {
	const platform = process.platform;
	const env = process.env;

	// Skip on Termux
	if (env.TERMUX_VERSION) return null;

	if (platform === "darwin") {
		// macOS: try pngpaste first (fast, simple), fall back to osascript
		return readClipboardImageViaPngpaste() ?? readClipboardImageViaOsascript();
	}

	if (platform === "linux") {
		if (isWaylandSession(env)) {
			return readClipboardImageViaWlPaste() ?? readClipboardImageViaXclip();
		}
		return readClipboardImageViaXclip() ?? readClipboardImageViaWlPaste();
	}

	// Windows / other: not supported without native addon
	return null;
}

/**
 * Read a clipboard image and save it to a temp file.
 * Returns the file path, or null if no image is available.
 */
export function readClipboardImageToFile(): string | null {
	const image = readClipboardImage();
	if (!image) return null;

	const ext = extensionForImageMimeType(image.mimeType) ?? "png";
	const fileName = `epi-clipboard-${randomUUID()}.${ext}`;
	const filePath = join(tmpdir(), fileName);
	writeFileSync(filePath, Buffer.from(image.bytes));
	return filePath;
}
