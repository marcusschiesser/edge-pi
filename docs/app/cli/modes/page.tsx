export default function ModesPage() {
	return (
		<>
			<h1>Modes</h1>
			<p>
				The <code>epi</code> CLI supports two primary modes of operation:
				interactive mode for ongoing conversations and print mode for one-shot
				tasks.
			</p>

			<h2>Interactive Mode</h2>
			<p>
				The default mode. Launches a streaming REPL where you can have a
				back-and-forth conversation with the agent.
			</p>
			<pre>
				<code>{`# Start interactive mode
epi

# Start with an initial prompt
epi "Help me refactor the auth module"`}</code>
			</pre>

			<h3>Features</h3>
			<ul>
				<li>
					<strong>Streaming responses</strong> &mdash; Text is displayed as
					it&apos;s generated
				</li>
				<li>
					<strong>Tool execution display</strong> &mdash; Tool calls are shown
					with their arguments and results
				</li>
				<li>
					<strong>Session persistence</strong> &mdash; Conversation is
					automatically saved
				</li>
				<li>
					<strong>Readline input</strong> &mdash; Standard terminal input with
					history
				</li>
			</ul>

			<h3>Commands</h3>
			<p>
				In interactive mode, the following commands are available:
			</p>
			<table>
				<thead>
					<tr>
						<th>Command</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>/help</code>
						</td>
						<td>Show available commands.</td>
					</tr>
					<tr>
						<td>
							<code>/skills</code>
						</td>
						<td>List loaded skills.</td>
					</tr>
					<tr>
						<td>
							<code>/skill:&lt;name&gt;</code>
						</td>
						<td>Invoke a skill by name.</td>
					</tr>
					<tr>
						<td>
							<code>/login</code>
						</td>
						<td>Login to the OAuth provider (Anthropic).</td>
					</tr>
					<tr>
						<td>
							<code>/logout</code>
						</td>
						<td>Logout from the OAuth provider.</td>
					</tr>
					<tr>
						<td>
							<code>/quit</code>, <code>/exit</code>
						</td>
						<td>Exit the CLI.</td>
					</tr>
					<tr>
						<td>
							<code>Ctrl+C</code>
						</td>
						<td>Exit the CLI.</td>
					</tr>
				</tbody>
			</table>

			<h3>Display Format</h3>
			<p>
				On startup, interactive mode displays:
			</p>
			<ul>
				<li>Provider and model information</li>
				<li>Loaded skills (when <code>--verbose</code> is enabled)</li>
				<li>Session file location</li>
			</ul>
			<p>
				During execution, tool calls are shown as{" "}
				<code>[tool_name]</code> with a preview of their arguments, followed by
				the result.
			</p>

			<hr />

			<h2>Print Mode</h2>
			<p>
				Non-interactive mode for scripting and automation. Processes the prompt
				and exits.
			</p>
			<pre>
				<code>{`# Basic usage
epi -p "List all TypeScript files in src/"

# With file input
epi -p @src/index.ts "Explain this file"

# Piped input
git diff | epi -p "Summarize these changes"`}</code>
			</pre>

			<h3>Text Output (default)</h3>
			<p>
				By default, print mode outputs only the final text response:
			</p>
			<pre>
				<code>{`$ epi -p "What is 2 + 2?"
2 + 2 = 4`}</code>
			</pre>

			<h3>JSON Output</h3>
			<p>
				Use <code>--mode json</code> to get structured output:
			</p>
			<pre>
				<code>{`$ epi -p --mode json "What is 2 + 2?"
{
  "type": "result",
  "text": "2 + 2 = 4",
  "stepCount": 0,
  "usage": {
    "input": 42,
    "output": 12
  }
}`}</code>
			</pre>
			<p>
				The JSON output includes:
			</p>
			<table>
				<thead>
					<tr>
						<th>Field</th>
						<th>Type</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>type</code>
						</td>
						<td>string</td>
						<td>
							Always <code>{`"result"`}</code>.
						</td>
					</tr>
					<tr>
						<td>
							<code>text</code>
						</td>
						<td>string</td>
						<td>The agent&apos;s text response.</td>
					</tr>
					<tr>
						<td>
							<code>stepCount</code>
						</td>
						<td>number</td>
						<td>Number of tool steps executed.</td>
					</tr>
					<tr>
						<td>
							<code>usage</code>
						</td>
						<td>object</td>
						<td>Token usage (input and output counts).</td>
					</tr>
				</tbody>
			</table>

			<hr />

			<h2>Combining Modes with Options</h2>
			<pre>
				<code>{`# Read-only analysis in print mode
epi -p --tools readonly "Review the code in src/"

# Use a specific model in interactive mode
epi --provider openai --model gpt-4o

# Ephemeral session with higher thinking
epi --no-session --thinking high "Design a caching system"

# Custom max steps for complex tasks
epi --max-steps 100 "Refactor the entire auth module"`}</code>
			</pre>
		</>
	);
}
