export default function CliSessionsPage() {
	return (
		<>
			<h1>CLI Sessions</h1>
			<p>
				The <code>epi</code> CLI automatically saves conversations as session
				files. You can continue previous sessions, use specific session files, or
				run without persistence.
			</p>

			<h2>Default Behavior</h2>
			<p>
				By default, each invocation of <code>epi</code> creates a new session
				file in a project-specific directory:
			</p>
			<pre>
				<code>{`~/.pi/agent/sessions/<sanitized-cwd>/session-YYYY-MM-DD-HH-mm-ss.jsonl`}</code>
			</pre>
			<p>
				The working directory path is sanitized and used to organize sessions by
				project.
			</p>

			<h2>Session Options</h2>

			<h3>Continue previous session</h3>
			<p>
				Resume the most recent session for the current directory:
			</p>
			<pre>
				<code>{`epi --continue
epi -c

# Continue and add a new prompt
epi -c "What were we working on?"`}</code>
			</pre>
			<p>
				When continuing, the previous messages are restored and available to the
				agent. It picks up right where you left off.
			</p>

			<h3>Specific session file</h3>
			<p>
				Open a specific session file:
			</p>
			<pre>
				<code>{`epi --session ./my-session.jsonl
epi --session ~/.pi/agent/sessions/my-project/session-2025-01-15-10-30-00.jsonl`}</code>
			</pre>

			<h3>Custom session directory</h3>
			<p>
				Override the default session storage location:
			</p>
			<pre>
				<code>{`epi --session-dir ./my-sessions`}</code>
			</pre>

			<h3>Ephemeral sessions</h3>
			<p>
				Run without saving the session:
			</p>
			<pre>
				<code>{`epi --no-session
epi --no-session -p "Quick question, no need to save"`}</code>
			</pre>
			<p>
				Ephemeral sessions use an in-memory session manager. The conversation is
				lost when the CLI exits.
			</p>

			<h2>Session File Format</h2>
			<p>
				Sessions use the JSONL format (one JSON object per line). The first line
				is a header, followed by entries:
			</p>
			<pre>
				<code>{`{"type":"session","version":1,"id":"abc123","timestamp":"2025-01-15T10:30:00Z","cwd":"/home/user/project"}
{"type":"message","id":"msg1","parentId":null,"timestamp":"...","message":{"role":"user","content":"Hello"}}
{"type":"message","id":"msg2","parentId":"msg1","timestamp":"...","message":{"role":"assistant","content":"Hi!"}}
{"type":"message","id":"msg3","parentId":"msg2","timestamp":"...","message":{"role":"user","content":"Read src/index.ts"}}`}</code>
			</pre>

			<h3>Entry Types</h3>
			<table>
				<thead>
					<tr>
						<th>Type</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>session</code>
						</td>
						<td>
							Header with metadata (version, ID, timestamp, working
							directory).
						</td>
					</tr>
					<tr>
						<td>
							<code>message</code>
						</td>
						<td>A conversation message (user, assistant, tool).</td>
					</tr>
					<tr>
						<td>
							<code>compaction</code>
						</td>
						<td>
							Summary of older messages that were compressed.
						</td>
					</tr>
					<tr>
						<td>
							<code>branch_summary</code>
						</td>
						<td>
							Summary of an abandoned conversation branch.
						</td>
					</tr>
					<tr>
						<td>
							<code>model_change</code>
						</td>
						<td>
							Records when the model was switched.
						</td>
					</tr>
				</tbody>
			</table>

			<h2>Session Directory Structure</h2>
			<pre>
				<code>{`~/.pi/agent/sessions/
├── home-user-project-a/
│   ├── session-2025-01-14-09-00-00.jsonl
│   └── session-2025-01-15-10-30-00.jsonl
├── home-user-project-b/
│   └── session-2025-01-15-14-00-00.jsonl
└── tmp-quick-test/
    └── session-2025-01-15-16-45-00.jsonl`}</code>
			</pre>
			<p>
				Sessions are organized by the sanitized working directory path. This
				keeps project-related conversations grouped together.
			</p>

			<h2>Session Lifecycle</h2>
			<ol>
				<li>
					<strong>Creation</strong> &mdash; A new session file is created when{" "}
					<code>epi</code> starts (unless using <code>--continue</code>,{" "}
					<code>--session</code>, or <code>--no-session</code>)
				</li>
				<li>
					<strong>Appending</strong> &mdash; Each message exchange is appended as
					a new line in the JSONL file
				</li>
				<li>
					<strong>Compaction</strong> &mdash; When the context grows too large,
					older messages are summarized and a compaction entry is written
				</li>
				<li>
					<strong>Continuation</strong> &mdash; On resume, the session is read
					and the message history is restored
				</li>
			</ol>
		</>
	);
}
