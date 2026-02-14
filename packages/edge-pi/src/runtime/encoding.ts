const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { ignoreBOM: true });

export function utf8ByteLength(text: string): number {
	return encoder.encode(text).length;
}

export function toUtf8String(input: string | Uint8Array): string {
	if (typeof input === "string") {
		return input;
	}
	return decoder.decode(input);
}

export function toUint8Array(input: string | Uint8Array): Uint8Array {
	if (typeof input === "string") {
		return encoder.encode(input);
	}
	return input;
}

export function bytesToBase64(bytes: Uint8Array): string {
	if (typeof globalThis.btoa === "function") {
		let binary = "";
		for (const byte of bytes) {
			binary += String.fromCharCode(byte);
		}
		return globalThis.btoa(binary);
	}

	const nodeBuffer = globalThis.Buffer;
	if (!nodeBuffer) {
		throw new Error("No base64 encoder available in this runtime");
	}
	return nodeBuffer.from(bytes).toString("base64");
}
