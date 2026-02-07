export default function SessionsPage() {
	return (
		<>
			<h1>Sessions</h1>
			<p>
				edge-pi provides a <code>SessionManager</code> for persisting
				conversations as tree-structured JSONL files. Sessions support branching,
				compaction, and model changes.
			</p>

			<h2>Overview</h2>
			<p>
				Each session is stored as an append-only JSONL file. Every line is a
				typed entry: a message, compaction summary, branch summary, or model
				change. The file forms a tree structure where entries reference their
				parent, enabling conversation branching.
			</p>

			<h2>Creating Sessions</h2>
			<pre>
				<code>{`import { SessionManager } from "edge-pi";

// Create a new persistent session
const session = SessionManager.create(process.cwd(), "./sessions");

// Open an existing session file
const existing = SessionManager.open("./sessions/session-2025-01-15.jsonl");

// Create an in-memory session (not persisted)
const ephemeral = SessionManager.inMemory();`}</code>
			</pre>

			<h3>Factory Methods</h3>
			<table>
				<thead>
					<tr>
						<th>Method</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>SessionManager.create(cwd, sessionDir)</code>
						</td>
						<td>
							Create a new session file in the given directory.
						</td>
					</tr>
					<tr>
						<td>
							<code>SessionManager.open(path, sessionDir?)</code>
						</td>
						<td>
							Open an existing session file.
						</td>
					</tr>
					<tr>
						<td>
							<code>SessionManager.inMemory(cwd?)</code>
						</td>
						<td>
							Create a session that is only kept in memory.
						</td>
					</tr>
				</tbody>
			</table>

			<h2>Session Entries</h2>
			<p>A session file contains the following entry types:</p>
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
							Header entry with session metadata (version, ID, timestamp,
							cwd).
						</td>
					</tr>
					<tr>
						<td>
							<code>message</code>
						</td>
						<td>
							A conversation message (user, assistant, or tool result).
						</td>
					</tr>
					<tr>
						<td>
							<code>compaction</code>
						</td>
						<td>
							A summary of compacted (older) messages.
						</td>
					</tr>
					<tr>
						<td>
							<code>branch_summary</code>
						</td>
						<td>
							A summary of an abandoned conversation branch.
						</td>
					</tr>
					<tr>
						<td>
							<code>model_change</code>
						</td>
						<td>
							Records a switch to a different model.
						</td>
					</tr>
				</tbody>
			</table>

			<h2>Appending Messages</h2>
			<pre>
				<code>{`// Append a message and get its entry ID
const id = session.appendMessage({
  role: "user",
  content: "Hello, world!",
});

// Record a model change
session.appendModelChange("anthropic", "claude-sonnet-4-20250514");

// Record a compaction
session.appendCompaction(
  "Summary of previous conversation...",
  firstKeptEntryId,
  tokensBefore
);`}</code>
			</pre>

			<h2>Tree Navigation</h2>
			<p>
				Sessions form a tree. Each entry has a parent ID, and you can navigate
				the tree to explore branches.
			</p>
			<pre>
				<code>{`// Get the current branch (path from root to leaf)
const branch = session.getBranch();

// Get the current leaf (most recent entry)
const leaf = session.getLeafEntry();

// Get the full tree structure
const tree = session.getTree();

// Get a specific entry by ID
const entry = session.getEntry("some-entry-id");`}</code>
			</pre>

			<h2>Branching</h2>
			<p>
				You can branch from any point in the conversation to explore alternative
				paths.
			</p>
			<pre>
				<code>{`// Branch from a specific entry (future messages fork from here)
session.branch(entryId);

// Branch with a summary of the abandoned path
session.branchWithSummary(
  entryId,
  "Was working on refactoring the parser but hit a dead end."
);

// Reset to the beginning
session.resetLeaf();`}</code>
			</pre>

			<h2>Building Context</h2>
			<p>
				Use <code>buildSessionContext()</code> to reconstruct the message history
				from a session. This handles compaction entries, branch summaries, and
				model changes.
			</p>
			<pre>
				<code>{`// Build context from the current session state
const context = session.buildSessionContext();

// Restore messages into an agent
agent.setMessages(context.messages);

// Check the active model
if (context.model) {
  console.log(\`Active model: \${context.model.provider}/\${context.model.modelId}\`);
}`}</code>
			</pre>

			<h2>Session File Format</h2>
			<p>
				Session files are JSONL (one JSON object per line). The first line is
				always the session header:
			</p>
			<pre>
				<code>{`{"type":"session","version":1,"id":"abc123","timestamp":"2025-01-15T10:30:00Z","cwd":"/home/user/project"}
{"type":"message","id":"msg1","parentId":null,"timestamp":"...","message":{"role":"user","content":"Hello"}}
{"type":"message","id":"msg2","parentId":"msg1","timestamp":"...","message":{"role":"assistant","content":"Hi!"}}`}</code>
			</pre>

			<h2>Properties</h2>
			<table>
				<thead>
					<tr>
						<th>Property</th>
						<th>Type</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>sessionId</code>
						</td>
						<td>string</td>
						<td>Unique session identifier.</td>
					</tr>
					<tr>
						<td>
							<code>sessionFile</code>
						</td>
						<td>string | undefined</td>
						<td>Path to the session file (undefined for in-memory).</td>
					</tr>
					<tr>
						<td>
							<code>cwd</code>
						</td>
						<td>string</td>
						<td>Working directory associated with the session.</td>
					</tr>
				</tbody>
			</table>
		</>
	);
}
