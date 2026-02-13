export default function SystemPromptPage() {
	return (
		<>
			<h1>System Prompt</h1>
			<p>
				edge-pi includes a system prompt builder that generates instructions
				tailored to the enabled tools. You can use it as-is, extend it, or
				replace it entirely.
			</p>

			<h2>Default Behavior</h2>
			<p>
				When you create a <code>CodingAgent</code> without specifying a system
				prompt, it automatically builds one based on the selected tool set. The
				prompt includes:
			</p>
			<ul>
				<li>A description of each enabled tool</li>
				<li>Guidelines for tool usage (e.g., prefer grep over bash for search)</li>
				<li>Instructions to read files before editing</li>
				<li>Working directory context</li>
			</ul>

			<h2>buildSystemPrompt()</h2>
			<p>
				Use <code>buildSystemPrompt()</code> directly to generate or inspect the
				prompt.
			</p>
			<pre>
				<code>{`import { buildSystemPrompt } from "edge-pi";

const prompt = buildSystemPrompt({
}, {
  selectedTools: ["read", "bash", "edit", "write"],
  cwd: process.cwd(),
});

console.log(prompt);`}</code>
			</pre>

			<h3>Options</h3>
			<table>
				<thead>
					<tr>
						<th>Option</th>
						<th>Type</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>customPrompt</code>
						</td>
						<td>
							<code>string</code>
						</td>
						<td>
							Replace the entire generated prompt with a custom one.
						</td>
					</tr>
					<tr>
						<td>
							<code>appendSystemPrompt</code>
						</td>
						<td>
							<code>string</code>
						</td>
						<td>
							Text to append to the end of the generated prompt.
						</td>
					</tr>
					<tr>
						<td>
							<code>contextFiles</code>
						</td>
						<td>
							<code>{`Array<{ path: string; content: string }>`}</code>
						</td>
						<td>
							Pre-loaded file contents to include in the prompt context.
						</td>
					</tr>
					<tr>
						<td>
							<code>skills</code>
						</td>
						<td>
							<code>Skill[]</code>
						</td>
						<td>
							Pre-loaded skills to include in the model-visible skills section.
						</td>
					</tr>
				</tbody>
			</table>

			<h3>Call options</h3>
			<p>
				Pass runtime values like selected tools and cwd in the second argument of{" "}
				<code>buildSystemPrompt()</code>.
			</p>
			<table>
				<thead>
					<tr>
						<th>Option</th>
						<th>Type</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>selectedTools</code>
						</td>
						<td>
							<code>string[]</code>
						</td>
						<td>
							Which tools to include descriptions for. Defaults to read, bash,
							edit, write.
						</td>
					</tr>
					<tr>
						<td>
							<code>cwd</code>
						</td>
						<td>
							<code>string</code>
						</td>
						<td>
							Working directory to include in the prompt footer.
						</td>
					</tr>
				</tbody>
			</table>

			<h2>Tool Descriptions</h2>
			<p>
				The prompt builder includes short descriptions for each tool that guide
				the model on when and how to use them:
			</p>
			<table>
				<thead>
					<tr>
						<th>Tool</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>read</code>
						</td>
						<td>Read file contents</td>
					</tr>
					<tr>
						<td>
							<code>bash</code>
						</td>
						<td>Execute bash commands</td>
					</tr>
					<tr>
						<td>
							<code>edit</code>
						</td>
						<td>Make surgical edits</td>
					</tr>
					<tr>
						<td>
							<code>write</code>
						</td>
						<td>Create or overwrite files</td>
					</tr>
					<tr>
						<td>
							<code>grep</code>
						</td>
						<td>Search file contents</td>
					</tr>
					<tr>
						<td>
							<code>find</code>
						</td>
						<td>Find files by glob</td>
					</tr>
					<tr>
						<td>
							<code>ls</code>
						</td>
						<td>List directory contents</td>
					</tr>
				</tbody>
			</table>

			<h2>Customization Examples</h2>

			<h3>Append instructions</h3>
			<pre>
				<code>{`const agent = new CodingAgent({
  model,
  systemPromptOptions: {
    appendSystemPrompt: \`
Always write tests for new code.
Follow the project's existing code style.
Use TypeScript strict mode.
\`,
  },
});`}</code>
			</pre>

			<h3>Include context files</h3>
			<pre>
				<code>{`import fs from "fs";

const agent = new CodingAgent({
  model,
  systemPromptOptions: {
    contextFiles: [
      {
        path: "CONVENTIONS.md",
        content: fs.readFileSync("CONVENTIONS.md", "utf-8"),
      },
    ],
  },
});`}</code>
			</pre>

			<h3>Include skills</h3>
			<pre>
				<code>{`import type { Skill } from "edge-pi";

const skills: Skill[] = [
  {
    name: "code-review",
    description: "Perform detailed code reviews",
    filePath: "/tmp/skills/code-review/SKILL.md",
    baseDir: "/tmp/skills/code-review",
    source: "project",
    disableModelInvocation: false,
  },
];

const agent = new CodingAgent({
  model,
  systemPromptOptions: {
    skills,
  },
});`}</code>
			</pre>

			<h3>Replace the prompt entirely</h3>
			<pre>
				<code>{`const agent = new CodingAgent({
  model,
  systemPromptOptions: {
    customPrompt: \`You are a code review assistant.
Only analyze code - never modify files.
Focus on security issues and performance.\`,
  },
});`}</code>
			</pre>
		</>
	);
}
