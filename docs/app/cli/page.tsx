export default function CliOverview() {
	return (
		<>
			<h1>CLI Overview</h1>
			<p>
				<code>edge-pi-cli</code> provides the <code>epi</code> command &mdash; an
				interactive terminal coding agent built on the edge-pi SDK. It supports
				multiple AI providers, session management, skills, and both interactive
				and non-interactive modes.
			</p>

			<h2>Installation</h2>
			<pre>
				<code>npm install -g edge-pi-cli</code>
			</pre>

			<h2>Usage</h2>
			<pre>
				<code>{`epi [options] [@files...] [messages...]`}</code>
			</pre>

			<h2>Examples</h2>
			<pre>
				<code>{`# Interactive mode
epi

# Interactive with initial prompt
epi "List all .ts files in src/"

# Include files in the initial message
epi @prompt.md "Refactor this"

# Non-interactive mode (process and exit)
epi -p "List all .ts files in src/"

# Continue previous session
epi --continue "What did we discuss?"

# Use a specific model
epi --provider anthropic --model claude-sonnet-4-20250514

# Read-only tools (no file modifications)
epi --tools readonly -p "Review the code in src/"

# Pipe input
echo "Explain this error" | epi -p`}</code>
			</pre>

			<h2>Options</h2>

			<h3>General</h3>
			<table>
				<thead>
					<tr>
						<th>Flag</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>--help</code>, <code>-h</code>
						</td>
						<td>Show help.</td>
					</tr>
					<tr>
						<td>
							<code>--version</code>, <code>-v</code>
						</td>
						<td>Show version.</td>
					</tr>
					<tr>
						<td>
							<code>--verbose</code>
						</td>
						<td>Enable verbose output.</td>
					</tr>
				</tbody>
			</table>

			<h3>Model</h3>
			<table>
				<thead>
					<tr>
						<th>Flag</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>--provider &lt;name&gt;</code>
						</td>
						<td>
							Provider: <code>anthropic</code>, <code>openai</code>, or{" "}
							<code>google</code>.
						</td>
					</tr>
					<tr>
						<td>
							<code>--model &lt;id&gt;</code>
						</td>
						<td>
							Model ID. Auto-detected from provider if omitted.
						</td>
					</tr>
					<tr>
						<td>
							<code>--api-key &lt;key&gt;</code>
						</td>
						<td>
							API key override. Defaults to stored credentials or environment
							variables.
						</td>
					</tr>
				</tbody>
			</table>

			<h3>Mode</h3>
			<table>
				<thead>
					<tr>
						<th>Flag</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>--print</code>, <code>-p</code>
						</td>
						<td>
							Non-interactive mode: process the prompt and exit.
						</td>
					</tr>
					<tr>
						<td>
							<code>--mode &lt;mode&gt;</code>
						</td>
						<td>
							Output mode: <code>text</code> (default) or <code>json</code>.
						</td>
					</tr>
				</tbody>
			</table>

			<h3>Session</h3>
			<table>
				<thead>
					<tr>
						<th>Flag</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>--continue</code>, <code>-c</code>
						</td>
						<td>Continue the most recent session.</td>
					</tr>
					<tr>
						<td>
							<code>--session &lt;path&gt;</code>
						</td>
						<td>Use a specific session file.</td>
					</tr>
					<tr>
						<td>
							<code>--session-dir &lt;dir&gt;</code>
						</td>
						<td>Custom directory for session storage.</td>
					</tr>
					<tr>
						<td>
							<code>--no-session</code>
						</td>
						<td>
							Don&apos;t save the session (ephemeral).
						</td>
					</tr>
				</tbody>
			</table>

			<h3>Tools & Thinking</h3>
			<table>
				<thead>
					<tr>
						<th>Flag</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>--tools &lt;set&gt;</code>
						</td>
						<td>
							Tool set: <code>coding</code> (default), <code>readonly</code>,
							or <code>all</code>.
						</td>
					</tr>
					<tr>
						<td>
							<code>--thinking &lt;level&gt;</code>
						</td>
						<td>
							Thinking level: <code>off</code>, <code>minimal</code>,{" "}
							<code>low</code>, <code>medium</code>, or <code>high</code>.
						</td>
					</tr>
					<tr>
						<td>
							<code>--max-steps &lt;n&gt;</code>
						</td>
						<td>
							Maximum agent steps per prompt (default: 50).
						</td>
					</tr>
				</tbody>
			</table>

			<h3>System Prompt</h3>
			<table>
				<thead>
					<tr>
						<th>Flag</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>--system-prompt &lt;text&gt;</code>
						</td>
						<td>Override the entire system prompt.</td>
					</tr>
					<tr>
						<td>
							<code>--append-system-prompt &lt;text&gt;</code>
						</td>
						<td>Append text to the system prompt.</td>
					</tr>
				</tbody>
			</table>

			<h3>Skills</h3>
			<table>
				<thead>
					<tr>
						<th>Flag</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>--skill &lt;path&gt;</code>
						</td>
						<td>
							Load a skill file or directory (repeatable).
						</td>
					</tr>
					<tr>
						<td>
							<code>--no-skills</code>
						</td>
						<td>Disable automatic skill discovery.</td>
					</tr>
				</tbody>
			</table>

			<h2>Input Methods</h2>

			<h3>Direct prompt</h3>
			<pre>
				<code>{`epi "Explain the main function"`}</code>
			</pre>

			<h3>File references</h3>
			<p>
				Prefix a file path with <code>@</code> to include its contents in the
				initial message:
			</p>
			<pre>
				<code>{`epi @src/index.ts "Review this file"
epi @prompt.md @context.txt`}</code>
			</pre>

			<h3>Piped input</h3>
			<pre>
				<code>{`cat error.log | epi -p "Explain this error"
git diff | epi -p "Review these changes"`}</code>
			</pre>

			<h2>Environment Variables</h2>
			<table>
				<thead>
					<tr>
						<th>Variable</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>ANTHROPIC_API_KEY</code>
						</td>
						<td>Anthropic Claude API key.</td>
					</tr>
					<tr>
						<td>
							<code>OPENAI_API_KEY</code>
						</td>
						<td>OpenAI GPT API key.</td>
					</tr>
					<tr>
						<td>
							<code>GEMINI_API_KEY</code>
						</td>
						<td>Google Gemini API key.</td>
					</tr>
					<tr>
						<td>
							<code>ANTHROPIC_OAUTH_TOKEN</code>
						</td>
						<td>
							Anthropic OAuth token (takes precedence over API key).
						</td>
					</tr>
					<tr>
						<td>
							<code>PI_CODING_AGENT_DIR</code>
						</td>
						<td>
							Custom agent config directory (default:{" "}
							<code>~/.pi/agent</code>).
						</td>
					</tr>
				</tbody>
			</table>
		</>
	);
}
