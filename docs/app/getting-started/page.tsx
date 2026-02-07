export default function GettingStarted() {
	return (
		<>
			<h1>Quick Start</h1>
			<p>
				Get up and running with edge-pi in minutes. This guide covers both the
				SDK (for programmatic use) and the CLI (for interactive terminal use).
			</p>

			<h2>Prerequisites</h2>
			<ul>
				<li>Node.js 20 or later</li>
				<li>
					An API key from at least one provider (Anthropic, OpenAI, or Google)
				</li>
			</ul>

			<hr />

			<h2>Using the CLI</h2>
			<p>
				The fastest way to start is with the <code>epi</code> command.
			</p>

			<h3>1. Install</h3>
			<pre>
				<code>npm install -g edge-pi-cli</code>
			</pre>

			<h3>2. Set your API key</h3>
			<pre>
				<code>{`# Pick one (or more) of these:
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export GEMINI_API_KEY=...`}</code>
			</pre>

			<h3>3. Run</h3>
			<pre>
				<code>{`# Interactive mode
epi

# One-shot mode
epi -p "List all TypeScript files in src/"

# With a specific model
epi --provider openai --model gpt-4o "Explain this codebase"`}</code>
			</pre>

			<hr />

			<h2>Using the SDK</h2>
			<p>Use the SDK to embed a coding agent in your own application.</p>

			<h3>1. Install</h3>
			<pre>
				<code>{`npm install edge-pi ai @ai-sdk/anthropic`}</code>
			</pre>
			<p>
				Replace <code>@ai-sdk/anthropic</code> with your preferred provider
				package (<code>@ai-sdk/openai</code>, <code>@ai-sdk/google</code>,
				etc.).
			</p>

			<h3>2. Basic usage</h3>
			<pre>
				<code>{`import { CodingAgent } from "edge-pi";
import { anthropic } from "@ai-sdk/anthropic";

const agent = new CodingAgent({
  model: anthropic("claude-sonnet-4-20250514"),
});

// Non-streaming
const result = await agent.prompt({
  prompt: "Read package.json and tell me the project name",
});
console.log(result.text);
console.log(\`Steps: \${result.stepCount}, Tokens: \${result.usage.totalTokens}\`);`}</code>
			</pre>

			<h3>3. Streaming</h3>
			<pre>
				<code>{`const stream = await agent.stream({
  prompt: "Find all TODO comments in the codebase",
});

for await (const chunk of stream.textStream) {
  process.stdout.write(chunk);
}`}</code>
			</pre>

			<h3>4. Custom tools</h3>
			<pre>
				<code>{`import { CodingAgent, createReadOnlyTools } from "edge-pi";
import { anthropic } from "@ai-sdk/anthropic";

// Use only read-only tools (read, grep, find, ls)
const agent = new CodingAgent({
  model: anthropic("claude-sonnet-4-20250514"),
  toolSet: "readonly",
});

// Or use all tools
const agentFull = new CodingAgent({
  model: anthropic("claude-sonnet-4-20250514"),
  toolSet: "all",
});`}</code>
			</pre>

			<h3>5. Session persistence</h3>
			<pre>
				<code>{`import { CodingAgent, SessionManager } from "edge-pi";
import { anthropic } from "@ai-sdk/anthropic";

// Create a persistent session
const session = SessionManager.create(process.cwd(), "./sessions");

const agent = new CodingAgent({
  model: anthropic("claude-sonnet-4-20250514"),
});

// Restore previous messages
const context = session.buildSessionContext();
if (context.messages.length > 0) {
  agent.setMessages(context.messages);
}

const result = await agent.prompt({
  prompt: "What files have we discussed?",
});

// Messages are auto-saved if you integrate with session
// See the Sessions docs for full details`}</code>
			</pre>

			<hr />

			<h2>Next Steps</h2>
			<ul>
				<li>
					<a href="/sdk">SDK Overview</a> &mdash; Full API reference for the
					edge-pi library
				</li>
				<li>
					<a href="/sdk/tools">Tools</a> &mdash; Detailed documentation for
					each built-in tool
				</li>
				<li>
					<a href="/cli">CLI Overview</a> &mdash; Complete CLI reference
				</li>
				<li>
					<a href="/cli/skills">Skills</a> &mdash; Extend the agent with custom
					instructions
				</li>
			</ul>
		</>
	);
}
