export default function CompactionPage() {
	return (
		<>
			<h1>Compaction</h1>
			<p>
				Compaction keeps the conversation within the model&apos;s context window
				by summarizing older messages. In <code>edge-pi</code>, compaction
				orchestration is part of <code>CodingAgent</code>.
			</p>

			<h2>How It Works</h2>
			<ol>
				<li>
					<strong>Token estimation</strong> &mdash; Messages are measured using a{" "}
					<code>chars / 4</code> heuristic (conservative, tends to
					overestimate).
				</li>
				<li>
					<strong>Threshold check</strong> &mdash; When estimated tokens exceed
					the context window minus a reserve, compaction triggers.
				</li>
				<li>
					<strong>Cut point</strong> &mdash; A split point is found that keeps
					recent messages intact while identifying older messages to summarize.
				</li>
				<li>
					<strong>Summarization</strong> &mdash; The older messages are
					summarized by the model into a structured format covering goals,
					progress, decisions, and next steps.
				</li>
				<li>
					<strong>File tracking</strong> &mdash; Read and modified files are
					extracted from tool calls and preserved in the summary.
				</li>
			</ol>

			<h2>Settings</h2>
			<pre>
				<code>{`// Defaults used by CodingAgent compaction:
// reserveTokens: 16384
// keepRecentTokens: 20000`}</code>
			</pre>
				<table>
					<thead>
						<tr>
							<th>Setting</th>
							<th>Type</th>
							<th>Default</th>
							<th>Description</th>
						</tr>
					</thead>
					<tbody>
						<tr>
							<td>
								<code>reserveTokens</code>
							</td>
							<td>number</td>
							<td>
								<code>16384</code>
							</td>
							<td>
								Tokens to reserve for the model&apos;s response.
							</td>
						</tr>
					<tr>
						<td>
							<code>keepRecentTokens</code>
						</td>
						<td>number</td>
						<td>
							<code>20000</code>
						</td>
						<td>
							Recent tokens to keep uncompacted.
						</td>
					</tr>
				</tbody>
			</table>

			<h2>CodingAgent Auto-Compaction</h2>
			<p>
				Compaction orchestration is built into <code>CodingAgent</code>.
				When configured with <code>mode: "auto"</code>, the agent checks for
				compaction after <code>generate()</code> and <code>stream()</code>.
			</p>
			<pre>
				<code>{`import { CodingAgent, SessionManager } from "edge-pi";

const sessionManager = SessionManager.create(process.cwd());

const agent = new CodingAgent({
  model,
  sessionManager,
  compaction: {
    contextWindow: 200_000,
    mode: "auto",
    settings: {
      reserveTokens: 16_384,
      keepRecentTokens: 20_000,
    },
    onCompactionComplete: (result) => {
      console.log("Compacted", result.tokensBefore, "tokens");
    },
  },
});

await agent.generate({ prompt: "Refactor auth" });`}</code>
			</pre>

			<h3>Manual Mode and Runtime Toggle</h3>
			<pre>
				<code>{`const agent = new CodingAgent({
  model,
  sessionManager,
  compaction: { contextWindow: 200_000, mode: "manual" },
});

await agent.compact();

if (agent.compaction) {
  agent.setCompaction({ ...agent.compaction, mode: "auto" });
  agent.setCompaction({ ...agent.compaction, mode: "manual" });
}`}</code>
				</pre>

			<h2>What&apos;s Public API</h2>
			<p>
				Use <code>CodingAgent</code> compaction APIs: <code>compaction</code>{" "}
				config in <code>CodingAgentConfig</code>,{" "}
				<code>agent.compact()</code>, and <code>agent.setCompaction()</code>.
				Low-level compaction helpers are internal and not exported from the package
				root.
			</p>

			<h3>Summary Format</h3>
			<p>
				The generated summary follows a structured format:
			</p>
			<pre>
				<code>{`## Goal
What the user is trying to accomplish.

## Progress
What has been done so far.

## Key Decisions
Important choices and their rationale.

## Next Steps
What remains to be done.

## Files
- Read: src/index.ts, src/utils.ts
- Modified: src/parser.ts, tests/parser.test.ts`}</code>
			</pre>

			<h2>Token Estimation</h2>
			<pre>
				<code>{`import { estimateTokens, estimateContextTokens } from "edge-pi";

// Estimate tokens for a single message
const tokens = estimateTokens(message);

// Estimate total tokens for all messages
const total = estimateContextTokens(messages);`}</code>
			</pre>
			<p>
				Token estimation uses a <code>chars / 4</code> heuristic. This is
				conservative (overestimates) but fast and works across all models.
			</p>

			<h2>Branch Summarization</h2>
			<p>
				When branching to a new conversation path, edge-pi can summarize the
				abandoned branch to preserve context.
			</p>
			<pre>
				<code>{`import {
  collectEntriesForBranchSummary,
  generateBranchSummary,
} from "edge-pi";

// Collect entries that will be abandoned
const { entries } = collectEntriesForBranchSummary(
  session,
  oldLeafId,
  targetBranchId
);

// Generate a summary
const result = await generateBranchSummary(entries, {
  model,
  signal: abortController.signal,
});

// Store the branch summary
session.branchWithSummary(targetBranchId, result.summary, {
  readFiles: result.readFiles,
  modifiedFiles: result.modifiedFiles,
});`}</code>
			</pre>
		</>
	);
}
