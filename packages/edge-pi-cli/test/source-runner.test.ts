import { describe, expect, it } from "vitest";
import { computeUpdatePolicy, resolveSourceDir } from "../src/source-runner.js";

describe("source-runner", () => {
	describe("resolveSourceDir", () => {
		it("uses EPI_SOURCE_DIR override when set", () => {
			expect(resolveSourceDir({ EPI_SOURCE_DIR: "/tmp/epi-source" })).toBe("/tmp/epi-source");
		});

		it("uses default directory when override is missing", () => {
			const dir = resolveSourceDir({});
			expect(dir.endsWith("/.edge-pi/source")).toBe(true);
		});
	});

	describe("computeUpdatePolicy", () => {
		it("skips update when disabled by env", () => {
			expect(computeUpdatePolicy({ EPI_NO_UPDATE: "1" }, "main", false)).toBe("skip-env");
		});

		it("skips update for dirty checkouts", () => {
			expect(computeUpdatePolicy({}, "main", true)).toBe("skip-dirty");
		});

		it("skips update for non-main branches", () => {
			expect(computeUpdatePolicy({}, "feature/test", false)).toBe("skip-branch");
		});

		it("updates clean main checkout", () => {
			expect(computeUpdatePolicy({}, "main", false)).toBe("update");
		});
	});
});
