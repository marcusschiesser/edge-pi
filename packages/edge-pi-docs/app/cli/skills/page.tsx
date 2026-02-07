export default function SkillsPage() {
	return (
		<>
			<h1>Skills</h1>
			<p>
				Skills are Markdown files with YAML frontmatter that provide custom
				instructions to the agent. They extend the agent&apos;s capabilities
				without modifying source code.
			</p>

			<h2>Overview</h2>
			<p>
				A skill is a Markdown document that gets included in the agent&apos;s
				system prompt. Skills can define specialized behaviors, coding
				conventions, review checklists, or any other instructions.
			</p>

			<h2>Skill Format</h2>
			<pre>
				<code>{`---
name: code-review
description: Performs thorough code reviews with security focus
---

# Code Review Skill

When reviewing code, follow these steps:

1. Check for security vulnerabilities (injection, XSS, CSRF)
2. Verify error handling and edge cases
3. Assess code readability and naming conventions
4. Look for performance issues
5. Check test coverage

Always provide specific line references and suggested fixes.`}</code>
			</pre>

			<h3>Frontmatter Fields</h3>
			<table>
				<thead>
					<tr>
						<th>Field</th>
						<th>Required</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>name</code>
						</td>
						<td>No</td>
						<td>
							Skill name. Defaults to the parent directory name.
						</td>
					</tr>
					<tr>
						<td>
							<code>description</code>
						</td>
						<td>Yes</td>
						<td>
							What the skill does (max 1024 characters).
						</td>
					</tr>
					<tr>
						<td>
							<code>license</code>
						</td>
						<td>No</td>
						<td>License identifier.</td>
					</tr>
					<tr>
						<td>
							<code>compatibility</code>
						</td>
						<td>No</td>
						<td>Compatibility metadata.</td>
					</tr>
					<tr>
						<td>
							<code>metadata</code>
						</td>
						<td>No</td>
						<td>Additional metadata.</td>
					</tr>
					<tr>
						<td>
							<code>allowed-tools</code>
						</td>
						<td>No</td>
						<td>Restrict which tools the skill can use.</td>
					</tr>
					<tr>
						<td>
							<code>disable-model-invocation</code>
						</td>
						<td>No</td>
						<td>
							If <code>true</code>, the model cannot invoke this skill on its
							own.
						</td>
					</tr>
				</tbody>
			</table>

			<h3>Name Validation</h3>
			<ul>
				<li>Lowercase letters, numbers, and hyphens only</li>
				<li>Maximum 64 characters</li>
				<li>No consecutive hyphens</li>
				<li>
					If the skill is in a subdirectory, the name must match the directory
					name
				</li>
			</ul>

			<h2>Skill Discovery</h2>
			<p>
				The CLI automatically discovers skills from two locations:
			</p>
			<table>
				<thead>
					<tr>
						<th>Location</th>
						<th>Scope</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>~/.pi/agent/skills/</code>
						</td>
						<td>User skills (available in all projects)</td>
					</tr>
					<tr>
						<td>
							<code>./.pi/skills/</code>
						</td>
						<td>Project skills (available in this project only)</td>
					</tr>
				</tbody>
			</table>

			<h3>Directory Structure</h3>
			<pre>
				<code>{`~/.pi/agent/skills/
├── code-review/
│   └── SKILL.md        # Skill in a subdirectory
├── security-audit/
│   └── SKILL.md
└── quick-fix.md        # Skill as a root-level file`}</code>
			</pre>
			<p>
				Skills can be either:
			</p>
			<ul>
				<li>
					<strong>Root-level <code>.md</code> files</strong> &mdash; Any{" "}
					<code>.md</code> file in the skills directory
				</li>
				<li>
					<strong>
						Subdirectory <code>SKILL.md</code> files
					</strong>{" "}
					&mdash; A <code>SKILL.md</code> inside a named subdirectory
				</li>
			</ul>

			<h2>Loading Skills</h2>

			<h3>Automatic discovery</h3>
			<p>
				Skills are loaded automatically from the default locations unless
				disabled:
			</p>
			<pre>
				<code>{`# Skills are auto-discovered
epi

# Disable automatic discovery
epi --no-skills`}</code>
			</pre>

			<h3>Explicit loading</h3>
			<p>
				Load specific skill files or directories:
			</p>
			<pre>
				<code>{`# Load a single skill file
epi --skill ./my-skills/review.md

# Load a skill directory
epi --skill ./my-skills/

# Load multiple skills
epi --skill ./skills/review.md --skill ./skills/deploy.md`}</code>
			</pre>

			<h2>Using Skills</h2>

			<h3>Automatic invocation</h3>
			<p>
				By default, skills are visible to the model and it can choose to follow
				them based on the conversation context.
			</p>

			<h3>Manual invocation</h3>
			<p>
				In interactive mode, invoke a skill directly:
			</p>
			<pre>
				<code>{`/skill:code-review`}</code>
			</pre>

			<h3>Listing skills</h3>
			<pre>
				<code>{`/skills`}</code>
			</pre>

			<h2>Skill Integration</h2>
			<p>
				Skills that are visible to the model are formatted as XML and appended to
				the system prompt:
			</p>
			<pre>
				<code>{`<skills>
  <skill name="code-review">
    <description>Performs thorough code reviews with security focus</description>
    <content>
      # Code Review Skill
      When reviewing code, follow these steps:
      ...
    </content>
  </skill>
</skills>`}</code>
			</pre>
			<p>
				Skills with <code>disable-model-invocation: true</code> are only
				available via explicit <code>/skill:name</code> invocation.
			</p>

			<h2>Name Collisions</h2>
			<p>
				If multiple skills share the same name (e.g., a user skill and a project
				skill), the CLI reports a diagnostic warning. The first-discovered skill
				takes priority.
			</p>

			<h2>Examples</h2>

			<h3>Convention enforcement</h3>
			<pre>
				<code>{`---
name: project-conventions
description: Enforces project coding conventions
---

# Project Conventions

- Use TypeScript strict mode
- All functions must have JSDoc comments
- Use \`camelCase\` for variables and functions
- Use \`PascalCase\` for types and interfaces
- Maximum line length: 100 characters
- Use \`const\` by default, \`let\` only when reassignment is needed`}</code>
			</pre>

			<h3>Deployment checklist</h3>
			<pre>
				<code>{`---
name: deploy
description: Pre-deployment checklist and procedures
disable-model-invocation: true
---

# Deployment Checklist

Before deploying, verify:

1. All tests pass: \`npm test\`
2. Build succeeds: \`npm run build\`
3. No TypeScript errors: \`npx tsc --noEmit\`
4. Lint passes: \`npm run lint\`
5. Environment variables are set
6. Database migrations are ready`}</code>
			</pre>
		</>
	);
}
