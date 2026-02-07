export default function CompactionPage() {
	return (
		<>
			<h1>Compaction</h1>
			<p>
				Compaction keeps the conversation within the model&apos;s context window
				by summarizing older messages. edge-pi provides utilities to detect when
				compaction is needed, prepare the messages, and generate summaries.
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
				<code>{`import { compactionSchema } from "edge-pi";

// Default settings
const defaults = {
  enabled: true,
  reserveTokens: 16384,   // Space to reserve for generation
  keepRecentTokens: 20000, // Recent context to preserve
};`}</code>
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
							<code>enabled</code>
						</td>
						<td>boolean</td>
						<td>
							<code>true</code>
						</td>
						<td>Whether compaction is active.</td>
					</tr>
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

			<h2>Checking If Compaction Is Needed</h2>
			<pre>
				<code>{`import {
  estimateContextTokens,
  shouldCompact,
} from "edge-pi";

const tokens = estimateContextTokens(messages);
const contextWindow = 200000; // Model's context window

if (shouldCompact(tokens, contextWindow, { enabled: true, reserveTokens: 16384 })) {
  // Trigger compaction
}`}</code>
			</pre>

			<h2>Running Compaction</h2>
			<pre>
				<code>{`import { prepareCompaction, compact } from "edge-pi";

// 1. Prepare: find the cut point and collect messages
const preparation = prepareCompaction(sessionEntries, settings);

if (preparation) {
  // 2. Run: generate the summary using the model
  const result = await compact(preparation, model);

  // 3. Store: save the compaction result in the session
  session.appendCompaction(
    result.summary,
    result.firstKeptEntryId,
    result.tokensBefore,
    result.details // { readFiles, modifiedFiles }
  );
}`}</code>
			</pre>

			<h3>Preparation</h3>
			<p>
				<code>prepareCompaction()</code> analyzes the session entries and returns
				a preparation object containing:
			</p>
			<ul>
				<li>
					<code>messagesToSummarize</code> &mdash; Older messages to compress
				</li>
				<li>
					<code>turnPrefixMessages</code> &mdash; Partial turn messages at the
					boundary
				</li>
				<li>
					<code>firstKeptEntryId</code> &mdash; ID of the first entry to keep
				</li>
				<li>
					<code>tokensBefore</code> &mdash; Token count before compaction
				</li>
				<li>
					<code>previousSummary</code> &mdash; Any existing compaction summary
					to build on
				</li>
				<li>
					<code>fileOps</code> &mdash; Tracked file read/write operations
				</li>
			</ul>
			<p>
				Returns <code>undefined</code> if compaction is not needed or not
				possible.
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
