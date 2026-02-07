import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { Skill, SkillDiagnostic } from "../src/skills.js";
import { formatSkillsForPrompt, loadSkills } from "../src/skills.js";

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

	describe("formatSkillsForPrompt", () => {
		it("should return empty string for no skills", () => {
			expect(formatSkillsForPrompt([])).toBe("");
		});

		it("should format skills as XML", () => {
			const skills: Skill[] = [
				{
					name: "test-skill",
					description: "A test skill.",
					filePath: "/path/to/skill/SKILL.md",
					baseDir: "/path/to/skill",
					source: "test",
					disableModelInvocation: false,
				},
			];

			const result = formatSkillsForPrompt(skills);

			expect(result).toContain("<available_skills>");
			expect(result).toContain("</available_skills>");
			expect(result).toContain("<name>test-skill</name>");
			expect(result).toContain("<description>A test skill.</description>");
			expect(result).toContain("<location>/path/to/skill/SKILL.md</location>");
		});

		it("should include intro text before XML", () => {
			const skills: Skill[] = [
				{
					name: "test-skill",
					description: "A test skill.",
					filePath: "/path/to/skill/SKILL.md",
					baseDir: "/path/to/skill",
					source: "test",
					disableModelInvocation: false,
				},
			];

			const result = formatSkillsForPrompt(skills);
			expect(result).toContain("The following skills provide specialized instructions");
			expect(result).toContain("Use the read tool to load a skill's file");
		});

		it("should escape XML special characters", () => {
			const skills: Skill[] = [
				{
					name: "test-skill",
					description: 'A skill with <special> & "characters".',
					filePath: "/path/to/skill/SKILL.md",
					baseDir: "/path/to/skill",
					source: "test",
					disableModelInvocation: false,
				},
			];

			const result = formatSkillsForPrompt(skills);
			expect(result).toContain("&lt;special&gt;");
			expect(result).toContain("&amp;");
			expect(result).toContain("&quot;characters&quot;");
		});

		it("should format multiple skills", () => {
			const skills: Skill[] = [
				{
					name: "skill-one",
					description: "First skill.",
					filePath: "/path/one/SKILL.md",
					baseDir: "/path/one",
					source: "test",
					disableModelInvocation: false,
				},
				{
					name: "skill-two",
					description: "Second skill.",
					filePath: "/path/two/SKILL.md",
					baseDir: "/path/two",
					source: "test",
					disableModelInvocation: false,
				},
			];

			const result = formatSkillsForPrompt(skills);
			expect(result).toContain("<name>skill-one</name>");
			expect(result).toContain("<name>skill-two</name>");
			expect((result.match(/<skill>/g) || []).length).toBe(2);
		});

		it("should exclude skills with disableModelInvocation", () => {
			const skills: Skill[] = [
				{
					name: "visible-skill",
					description: "A visible skill.",
					filePath: "/path/visible/SKILL.md",
					baseDir: "/path/visible",
					source: "test",
					disableModelInvocation: false,
				},
				{
					name: "hidden-skill",
					description: "A hidden skill.",
					filePath: "/path/hidden/SKILL.md",
					baseDir: "/path/hidden",
					source: "test",
					disableModelInvocation: true,
				},
			];

			const result = formatSkillsForPrompt(skills);
			expect(result).toContain("<name>visible-skill</name>");
			expect(result).not.toContain("<name>hidden-skill</name>");
			expect((result.match(/<skill>/g) || []).length).toBe(1);
		});

		it("should return empty string when all skills have disableModelInvocation", () => {
			const skills: Skill[] = [
				{
					name: "hidden-skill",
					description: "A hidden skill.",
					filePath: "/path/hidden/SKILL.md",
					baseDir: "/path/hidden",
					source: "test",
					disableModelInvocation: true,
				},
			];

			expect(formatSkillsForPrompt(skills)).toBe("");
		});
	});
});
