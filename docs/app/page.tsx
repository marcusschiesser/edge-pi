export default function Home() {
	return (
		<>
			<h1>edge-pi</h1>
			<p>
				<strong>edge-pi</strong> is a lightweight, Vercel AI SDK-based coding
				agent library and CLI. It provides the core primitives for building
				AI-powered coding assistants with tool support, session management, and
				context compaction.
			</p>

			<h2>What is edge-pi?</h2>
			<p>
				edge-pi consists of two packages that work together to provide a
				complete coding agent experience:
			</p>
			<ul>
				<li>
					<strong>
						<a href="/sdk">edge-pi</a>
					</strong>{" "}
					&mdash; The SDK. A TypeScript library built on the Vercel AI SDK that
					provides a <code>CodingAgent</code> class, file system tools,
					session persistence, and context compaction.
				</li>
				<li>
					<strong>
						<a href="/cli">edge-pi-cli</a>
					</strong>{" "}
					&mdash; The CLI. An interactive terminal application (
					<code>epi</code>) that wraps the SDK with multi-provider support,
					authentication, skills, and both interactive and non-interactive
					modes.
				</li>
			</ul>

			<h2>Key Features</h2>
			<ul>
				<li>
					<strong>Vercel AI SDK integration</strong> &mdash; Works with any
					Vercel AI <code>LanguageModel</code> (Anthropic, OpenAI, Google, and
					more)
				</li>
				<li>
					<strong>7 built-in tools</strong> &mdash; read, write, edit, bash,
					grep, find, ls
				</li>
				<li>
					<strong>Session management</strong> &mdash; Tree-structured JSONL
					sessions with branching support
				</li>
				<li>
					<strong>Context compaction</strong> &mdash; Automatic summarization of
					old messages to stay within context limits
				</li>
				<li>
					<strong>Streaming and non-streaming</strong> &mdash; Both{" "}
					<code>stream()</code> and <code>prompt()</code> execution modes
				</li>
				<li>
					<strong>Skills system</strong> &mdash; Extend the agent with custom
					instructions via Markdown files
				</li>
				<li>
					<strong>Multi-provider auth</strong> &mdash; API keys and OAuth for
					Anthropic, OpenAI, and Google
				</li>
			</ul>

			<h2>Quick Example</h2>
			<pre>
				<code>{`import { CodingAgent } from "edge-pi";
import { anthropic } from "@ai-sdk/anthropic";

const agent = new CodingAgent({
  model: anthropic("claude-sonnet-4-20250514"),
});

const result = await agent.prompt({
  prompt: "Read the README.md and summarize it",
});

console.log(result.text);`}</code>
			</pre>
			<p>
				See the <a href="/getting-started">Quick Start</a> guide to get up and
				running.
			</p>

			<h2>Architecture</h2>
			<p>
				edge-pi is designed as a thin, composable layer on top of the Vercel AI
				SDK. The core <code>CodingAgent</code> class wraps the SDK&apos;s tool
				loop with sensible defaults for coding tasks:
			</p>
			<pre>
				<code>{`CodingAgent
├── Vercel AI SDK (generateText / streamText)
├── Tool sets (coding, readonly, all)
├── System prompt builder
├── Message steering & follow-up queues
├── Session persistence (JSONL)
└── Context compaction`}</code>
			</pre>

			<h2>Packages</h2>
			<table>
				<thead>
					<tr>
						<th>Package</th>
						<th>Description</th>
						<th>Install</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>edge-pi</code>
						</td>
						<td>SDK &mdash; agent, tools, sessions, compaction</td>
						<td>
							<code>npm install edge-pi</code>
						</td>
					</tr>
					<tr>
						<td>
							<code>edge-pi-cli</code>
						</td>
						<td>CLI &mdash; interactive terminal agent</td>
						<td>
							<code>npm install -g edge-pi-cli</code>
						</td>
					</tr>
				</tbody>
			</table>
		</>
	);
}
