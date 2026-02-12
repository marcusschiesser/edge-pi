import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { SkillDiagnostic } from "../src/skills.js";
import { loadSkills } from "../src/skills.js";

const fixturesDir = resolve(__dirname, "fixtures/skills");

describe("skills", () => {
	describe("loadSkills", () => {
		it("should load a valid skill from explicit path", () => {
			const { skills, diagnostics } = loadSkills({
				agentDir: "/nonexistent",
				cwd: "/nonexistent",
				skillPaths: [join(fixturesDir, "valid-skill")],
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe("valid-skill");
			expect(skills[0].description).toBe("A valid skill for testing purposes.");
			expect(skills[0].source).toBe("path");
			expect(diagnostics).toHaveLength(0);
		});

		it("should warn when name doesn't match parent directory", () => {
			const { skills, diagnostics } = loadSkills({
				agentDir: "/nonexistent",
				cwd: "/nonexistent",
				skillPaths: [join(fixturesDir, "name-mismatch")],
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe("different-name");
			expect(diagnostics.some((d: SkillDiagnostic) => d.message.includes("does not match parent directory"))).toBe(
				true,
			);
		});

		it("should warn and skip skill when description is missing", () => {
			const { skills, diagnostics } = loadSkills({
				agentDir: "/nonexistent",
				cwd: "/nonexistent",
				skillPaths: [join(fixturesDir, "missing-description")],
			});

			expect(skills).toHaveLength(0);
			expect(diagnostics.some((d: SkillDiagnostic) => d.message.includes("description is required"))).toBe(true);
		});

		it("should warn when unknown frontmatter fields are present", () => {
			const { skills, diagnostics } = loadSkills({
				agentDir: "/nonexistent",
				cwd: "/nonexistent",
				skillPaths: [join(fixturesDir, "unknown-field")],
			});

			expect(skills).toHaveLength(1);
			expect(
				diagnostics.some((d: SkillDiagnostic) => d.message.includes('unknown frontmatter field "author"')),
			).toBe(true);
			expect(
				diagnostics.some((d: SkillDiagnostic) => d.message.includes('unknown frontmatter field "version"')),
			).toBe(true);
		});

		it("should load nested skills recursively", () => {
			const { skills } = loadSkills({
				agentDir: "/nonexistent",
				cwd: "/nonexistent",
				skillPaths: [join(fixturesDir, "nested")],
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].name).toBe("child-skill");
		});

		it("should skip files without frontmatter", () => {
			const { skills, diagnostics } = loadSkills({
				agentDir: "/nonexistent",
				cwd: "/nonexistent",
				skillPaths: [join(fixturesDir, "no-frontmatter")],
			});

			expect(skills).toHaveLength(0);
			expect(diagnostics.some((d: SkillDiagnostic) => d.message.includes("description is required"))).toBe(true);
		});

		it("should warn and skip skill when YAML is invalid", () => {
			const { skills, diagnostics } = loadSkills({
				agentDir: "/nonexistent",
				cwd: "/nonexistent",
				skillPaths: [join(fixturesDir, "invalid-yaml")],
			});

			expect(skills).toHaveLength(0);
			expect(diagnostics.some((d: SkillDiagnostic) => d.message.includes("at line"))).toBe(true);
		});

		it("should parse disable-model-invocation field", () => {
			const { skills, diagnostics } = loadSkills({
				agentDir: "/nonexistent",
				cwd: "/nonexistent",
				skillPaths: [join(fixturesDir, "disable-model-invocation")],
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].disableModelInvocation).toBe(true);
			expect(diagnostics.some((d: SkillDiagnostic) => d.message.includes("unknown frontmatter field"))).toBe(false);
		});

		it("should default disableModelInvocation to false", () => {
			const { skills } = loadSkills({
				agentDir: "/nonexistent",
				cwd: "/nonexistent",
				skillPaths: [join(fixturesDir, "valid-skill")],
			});

			expect(skills).toHaveLength(1);
			expect(skills[0].disableModelInvocation).toBe(false);
		});

		it("should warn when skill path does not exist", () => {
			const { skills, diagnostics } = loadSkills({
				agentDir: "/nonexistent",
				cwd: "/nonexistent",
				skillPaths: ["/non/existent/path"],
			});

			expect(skills).toHaveLength(0);
			expect(diagnostics.some((d: SkillDiagnostic) => d.message.includes("does not exist"))).toBe(true);
		});

		it("should load multiple skills from the fixture directory", () => {
			const { skills } = loadSkills({
				agentDir: "/nonexistent",
				cwd: "/nonexistent",
				skillPaths: [fixturesDir],
			});

			// Should load skills with valid descriptions
			expect(skills.length).toBeGreaterThanOrEqual(5);
		});

		it("should handle name collisions and keep first skill", () => {
			const { skills } = loadSkills({
				agentDir: "/nonexistent",
				cwd: "/nonexistent",
				skillPaths: [join(fixturesDir, "valid-skill"), join(fixturesDir, "valid-skill")],
			});

			// Deduplication by realpath should yield exactly one
			expect(skills).toHaveLength(1);
		});
	});
});
