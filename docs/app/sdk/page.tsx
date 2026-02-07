export default function SdkOverview() {
	return (
		<>
			<h1>SDK Overview</h1>
			<p>
				The <code>edge-pi</code> package is a TypeScript library for building
				AI-powered coding agents. It is built on the{" "}
				<a
					href="https://sdk.vercel.ai"
					target="_blank"
					rel="noopener noreferrer"
				>
					Vercel AI SDK
				</a>{" "}
				and works with any <code>LanguageModel</code> provider.
			</p>

			<h2>Installation</h2>
			<pre>
				<code>{`npm install edge-pi ai`}</code>
			</pre>
			<p>
				You also need a provider package. For example, for Anthropic:
			</p>
			<pre>
				<code>{`npm install @ai-sdk/anthropic`}</code>
			</pre>

			<h2>CodingAgent</h2>
			<p>
				The main entry point is the <code>CodingAgent</code> class. It wraps the
				Vercel AI SDK&apos;s tool loop with defaults for coding tasks.
			</p>

			<h3>Constructor</h3>
			<pre>
				<code>{`import { CodingAgent } from "edge-pi";

const agent = new CodingAgent({
  model,              // Required: Vercel AI LanguageModel
  cwd,                // Working directory (default: process.cwd())
  maxSteps,           // Max steps per loop (default: 10)
  systemPrompt,       // Override the full system prompt
  systemPromptOptions,// Or configure the prompt builder
  toolSet,            // "coding" | "readonly" | "all" (default: "coding")
  extraTools,         // Merge additional tools into the set
  thinkingLevel,      // For reasoning models: "off" | "minimal" | "low" | "medium" | "high"
});`}</code>
			</pre>

			<h3>Configuration</h3>
			<table>
				<thead>
					<tr>
						<th>Option</th>
						<th>Type</th>
						<th>Default</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>model</code>
						</td>
						<td>
							<code>LanguageModel</code>
						</td>
						<td>&mdash;</td>
						<td>Required. Any Vercel AI SDK model.</td>
					</tr>
					<tr>
						<td>
							<code>cwd</code>
						</td>
						<td>
							<code>string</code>
						</td>
						<td>
							<code>process.cwd()</code>
						</td>
						<td>Working directory for tools.</td>
					</tr>
					<tr>
						<td>
							<code>maxSteps</code>
						</td>
						<td>
							<code>number</code>
						</td>
						<td>
							<code>10</code>
						</td>
						<td>Maximum tool steps per execution loop.</td>
					</tr>
					<tr>
						<td>
							<code>systemPrompt</code>
						</td>
						<td>
							<code>string</code>
						</td>
						<td>&mdash;</td>
						<td>Override the entire system prompt.</td>
					</tr>
					<tr>
						<td>
							<code>systemPromptOptions</code>
						</td>
						<td>
							<code>BuildSystemPromptOptions</code>
						</td>
						<td>&mdash;</td>
						<td>Configure the system prompt builder.</td>
					</tr>
					<tr>
						<td>
							<code>toolSet</code>
						</td>
						<td>
							<code>{`"coding" | "readonly" | "all"`}</code>
						</td>
						<td>
							<code>{`"coding"`}</code>
						</td>
						<td>Which tool set to use.</td>
					</tr>
					<tr>
						<td>
							<code>extraTools</code>
						</td>
						<td>
							<code>ToolSet</code>
						</td>
						<td>&mdash;</td>
						<td>Additional tools to merge in.</td>
					</tr>
					<tr>
						<td>
							<code>thinkingLevel</code>
						</td>
						<td>
							<code>ThinkingLevel</code>
						</td>
						<td>&mdash;</td>
						<td>
							Thinking budget for reasoning models.
						</td>
					</tr>
				</tbody>
			</table>

			<h2>Execution Methods</h2>

			<h3>prompt()</h3>
			<p>
				Non-streaming execution. Runs the tool loop to completion and returns the
				final result.
			</p>
			<pre>
				<code>{`const result = await agent.prompt({
  prompt: "Read src/index.ts and explain it",
  // Optional: provide messages instead of prompt
  // messages: [{ role: "user", content: "..." }],
});

console.log(result.text);       // Final text response
console.log(result.messages);   // Full message history
console.log(result.usage);      // Token usage
console.log(result.stepCount);  // Number of tool steps`}</code>
			</pre>

			<h3>stream()</h3>
			<p>
				Streaming execution. Returns a Vercel AI{" "}
				<code>StreamTextResult</code> that you can consume incrementally.
			</p>
			<pre>
				<code>{`const stream = await agent.stream({
  prompt: "Find and fix the bug in src/parser.ts",
});

// Stream text chunks
for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}

// Or access the full result after streaming
const result = await stream;
console.log(result.usage);`}</code>
			</pre>

			<h2>Message Control</h2>
			<p>
				The agent provides methods to control messages during and between
				executions.
			</p>

			<h3>setMessages()</h3>
			<p>
				Restore a previous message history (e.g., from a session).
			</p>
			<pre>
				<code>{`agent.setMessages(previousMessages);`}</code>
			</pre>

			<h3>steer()</h3>
			<p>
				Inject a message between tool steps during execution. Useful for
				providing corrections mid-loop.
			</p>
			<pre>
				<code>{`// While the agent is running:
agent.steer({
  role: "user",
  content: "Actually, use the v2 API instead",
});`}</code>
			</pre>

			<h3>followUp()</h3>
			<p>
				Queue a message for after the current loop completes. Triggers another
				execution loop.
			</p>
			<pre>
				<code>{`agent.followUp({
  role: "user",
  content: "Now run the tests",
});`}</code>
			</pre>

			<h3>abort()</h3>
			<p>Abort the current execution.</p>
			<pre>
				<code>{`agent.abort();`}</code>
			</pre>

			<h2>Tool Sets</h2>
			<p>
				Three pre-configured tool sets are available:
			</p>
			<table>
				<thead>
					<tr>
						<th>Set</th>
						<th>Tools</th>
						<th>Use Case</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>coding</code>
						</td>
						<td>read, bash, edit, write</td>
						<td>General coding tasks (default)</td>
					</tr>
					<tr>
						<td>
							<code>readonly</code>
						</td>
						<td>read, grep, find, ls</td>
						<td>Code review, analysis, exploration</td>
					</tr>
					<tr>
						<td>
							<code>all</code>
						</td>
						<td>read, bash, edit, write, grep, find, ls</td>
						<td>Full capabilities</td>
					</tr>
				</tbody>
			</table>
			<p>
				See the <a href="/sdk/tools">Tools</a> page for detailed documentation
				on each tool.
			</p>

			<h2>Exports</h2>
			<p>
				The <code>edge-pi</code> package exports the following:
			</p>
			<pre>
				<code>{`// Agent
import { CodingAgent } from "edge-pi";

// Tool factories
import {
  createBashTool,
  createReadTool,
  createWriteTool,
  createEditTool,
  createGrepTool,
  createFindTool,
  createLsTool,
  createCodingTools,
  createReadOnlyTools,
  createAllTools,
} from "edge-pi";

// System prompt
import { buildSystemPrompt } from "edge-pi";

// Session management
import { SessionManager, buildSessionContext } from "edge-pi";

// Compaction
import {
  compact,
  prepareCompaction,
  findCutPoint,
  shouldCompact,
  estimateTokens,
  estimateContextTokens,
  generateBranchSummary,
  collectEntriesForBranchSummary,
  compactionSchema,
} from "edge-pi";

// Types (re-exported from Vercel AI SDK)
import type {
  CodingAgentConfig,
  PromptOptions,
  PromptResult,
  LanguageModel,
  ModelMessage,
  GenerateTextResult,
  StreamTextResult,
  ThinkingLevel,
  Tool,
  ToolSet,
  LanguageModelUsage,
} from "edge-pi";`}</code>
			</pre>
		</>
	);
}
