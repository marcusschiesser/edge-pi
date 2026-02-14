import { describe, expect, it } from "vitest";
import { bytesToBase64, toUint8Array, toUtf8String, utf8ByteLength } from "../src/runtime/encoding.js";

describe("runtime encoding helpers", () => {
	it("calculates utf-8 byte length for multibyte text", () => {
		expect(utf8ByteLength("abc")).toBe(3);
		expect(utf8ByteLength("€")).toBe(3);
	});

	it("roundtrips text through bytes", () => {
		const bytes = toUint8Array("hello €");
		expect(toUtf8String(bytes)).toBe("hello €");
	});

	it("encodes bytes as base64", () => {
		const bytes = new Uint8Array([97, 98, 99]); // "abc"
		expect(bytesToBase64(bytes)).toBe("YWJj");
	});
});
