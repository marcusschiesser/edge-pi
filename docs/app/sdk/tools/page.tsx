export default function ToolsPage() {
	return (
		<>
			<h1>Tools</h1>
			<p>
				edge-pi provides 7 built-in tools for file system operations and command
				execution. Each tool is a factory function that returns a Vercel AI SDK{" "}
				<code>tool()</code> definition.
			</p>

			<h2>Tool Sets</h2>
			<p>
				Tools are grouped into pre-configured sets. You can also create
				individual tools with the factory functions.
			</p>
			<pre>
				<code>{`import {
  createCodingTools,    // read, bash, edit, write
  createReadOnlyTools,  // read, grep, find, ls
  createAllTools,       // all 7 tools
} from "edge-pi";

const tools = createAllTools(process.cwd());`}</code>
			</pre>

			<hr />

			<h2>read</h2>
			<p>Read file contents with optional offset and line limit.</p>
			<pre>
				<code>{`import { createReadTool } from "edge-pi";
const readTool = createReadTool(process.cwd());`}</code>
			</pre>
			<h3>Parameters</h3>
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Type</th>
						<th>Required</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>path</code>
						</td>
						<td>string</td>
						<td>Yes</td>
						<td>
							File path (relative or absolute). Supports <code>~</code>{" "}
							expansion.
						</td>
					</tr>
					<tr>
						<td>
							<code>offset</code>
						</td>
						<td>number</td>
						<td>No</td>
						<td>Line number to start reading from (1-indexed).</td>
					</tr>
					<tr>
						<td>
							<code>limit</code>
						</td>
						<td>number</td>
						<td>No</td>
						<td>Maximum number of lines to read.</td>
					</tr>
				</tbody>
			</table>
			<h3>Output</h3>
			<ul>
				<li>
					Truncated to <strong>2000 lines</strong> or <strong>50KB</strong>{" "}
					(whichever is hit first)
				</li>
				<li>
					Detects image files by extension and returns a placeholder message
				</li>
				<li>Includes truncation notice when output is clipped</li>
			</ul>

			<hr />

			<h2>bash</h2>
			<p>Execute shell commands in the working directory.</p>
			<pre>
				<code>{`import { createBashTool } from "edge-pi";
const bashTool = createBashTool(process.cwd());`}</code>
			</pre>
			<h3>Parameters</h3>
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Type</th>
						<th>Required</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>command</code>
						</td>
						<td>string</td>
						<td>Yes</td>
						<td>The bash command to execute.</td>
					</tr>
					<tr>
						<td>
							<code>timeout</code>
						</td>
						<td>number</td>
						<td>No</td>
						<td>Timeout in seconds.</td>
					</tr>
				</tbody>
			</table>
			<h3>Output</h3>
			<ul>
				<li>
					Combined stdout and stderr, truncated to <strong>2000 lines</strong>{" "}
					or <strong>50KB</strong>
				</li>
				<li>
					Full output saved to a temp file when truncated (path included in
					output)
				</li>
				<li>Kills the full process tree on abort or timeout</li>
			</ul>

			<hr />

			<h2>edit</h2>
			<p>
				Make surgical edits to files by matching exact text and replacing it.
			</p>
			<pre>
				<code>{`import { createEditTool } from "edge-pi";
const editTool = createEditTool(process.cwd());`}</code>
			</pre>
			<h3>Parameters</h3>
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Type</th>
						<th>Required</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>path</code>
						</td>
						<td>string</td>
						<td>Yes</td>
						<td>File path to edit.</td>
					</tr>
					<tr>
						<td>
							<code>oldText</code>
						</td>
						<td>string</td>
						<td>Yes</td>
						<td>
							Text to find. Must match exactly (or via fuzzy normalization).
						</td>
					</tr>
					<tr>
						<td>
							<code>newText</code>
						</td>
						<td>string</td>
						<td>Yes</td>
						<td>Replacement text.</td>
					</tr>
				</tbody>
			</table>
			<h3>Behavior</h3>
			<ul>
				<li>
					<strong>Exact match first</strong>, then falls back to fuzzy matching
					(normalized whitespace, smart quotes, dashes)
				</li>
				<li>Validates that the match is unique (fails if multiple matches)</li>
				<li>Returns a unified diff of the change</li>
				<li>Preserves line endings (CRLF/LF) and BOM</li>
			</ul>

			<hr />

			<h2>write</h2>
			<p>Create or overwrite files.</p>
			<pre>
				<code>{`import { createWriteTool } from "edge-pi";
const writeTool = createWriteTool(process.cwd());`}</code>
			</pre>
			<h3>Parameters</h3>
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Type</th>
						<th>Required</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>path</code>
						</td>
						<td>string</td>
						<td>Yes</td>
						<td>File path to write.</td>
					</tr>
					<tr>
						<td>
							<code>content</code>
						</td>
						<td>string</td>
						<td>Yes</td>
						<td>Content to write.</td>
					</tr>
				</tbody>
			</table>
			<h3>Behavior</h3>
			<ul>
				<li>Automatically creates parent directories if they don&apos;t exist</li>
				<li>Overwrites existing files</li>
			</ul>

			<hr />

			<h2>grep</h2>
			<p>
				Search file contents with regex or literal patterns. Uses{" "}
				<code>ripgrep</code> when available, with a built-in fallback.
			</p>
			<pre>
				<code>{`import { createGrepTool } from "edge-pi";
const grepTool = createGrepTool(process.cwd());`}</code>
			</pre>
			<h3>Parameters</h3>
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Type</th>
						<th>Required</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>pattern</code>
						</td>
						<td>string</td>
						<td>Yes</td>
						<td>Regex or literal search pattern.</td>
					</tr>
					<tr>
						<td>
							<code>path</code>
						</td>
						<td>string</td>
						<td>No</td>
						<td>Directory to search in.</td>
					</tr>
					<tr>
						<td>
							<code>glob</code>
						</td>
						<td>string</td>
						<td>No</td>
						<td>
							File glob filter (e.g., <code>*.ts</code>).
						</td>
					</tr>
					<tr>
						<td>
							<code>ignoreCase</code>
						</td>
						<td>boolean</td>
						<td>No</td>
						<td>Case-insensitive search.</td>
					</tr>
					<tr>
						<td>
							<code>literal</code>
						</td>
						<td>boolean</td>
						<td>No</td>
						<td>Treat pattern as a literal string.</td>
					</tr>
					<tr>
						<td>
							<code>context</code>
						</td>
						<td>number</td>
						<td>No</td>
						<td>Lines of context before and after matches.</td>
					</tr>
					<tr>
						<td>
							<code>limit</code>
						</td>
						<td>number</td>
						<td>No</td>
						<td>Maximum matches (default: 100).</td>
					</tr>
				</tbody>
			</table>
			<h3>Behavior</h3>
			<ul>
				<li>
					Respects <code>.gitignore</code>
				</li>
				<li>Truncates long lines to 500 characters</li>
				<li>
					Output truncated to <strong>50KB</strong>
				</li>
			</ul>

			<hr />

			<h2>find</h2>
			<p>
				Find files by glob pattern. Uses <code>fd</code> when available, with a
				built-in fallback.
			</p>
			<pre>
				<code>{`import { createFindTool } from "edge-pi";
const findTool = createFindTool(process.cwd());`}</code>
			</pre>
			<h3>Parameters</h3>
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Type</th>
						<th>Required</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>pattern</code>
						</td>
						<td>string</td>
						<td>Yes</td>
						<td>
							Glob pattern (e.g., <code>**/*.ts</code>).
						</td>
					</tr>
					<tr>
						<td>
							<code>path</code>
						</td>
						<td>string</td>
						<td>No</td>
						<td>Directory to search in.</td>
					</tr>
					<tr>
						<td>
							<code>limit</code>
						</td>
						<td>number</td>
						<td>No</td>
						<td>Maximum results (default: 1000).</td>
					</tr>
				</tbody>
			</table>
			<h3>Behavior</h3>
			<ul>
				<li>
					Respects <code>.gitignore</code>
				</li>
				<li>
					Output truncated to <strong>50KB</strong>
				</li>
			</ul>

			<hr />

			<h2>ls</h2>
			<p>List directory contents with metadata.</p>
			<pre>
				<code>{`import { createLsTool } from "edge-pi";
const lsTool = createLsTool(process.cwd());`}</code>
			</pre>
			<h3>Parameters</h3>
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Type</th>
						<th>Required</th>
						<th>Description</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>
							<code>path</code>
						</td>
						<td>string</td>
						<td>No</td>
						<td>Directory to list (defaults to cwd).</td>
					</tr>
					<tr>
						<td>
							<code>limit</code>
						</td>
						<td>number</td>
						<td>No</td>
						<td>Maximum entries (default: 500).</td>
					</tr>
				</tbody>
			</table>
			<h3>Behavior</h3>
			<ul>
				<li>
					Directories are suffixed with <code>/</code>
				</li>
				<li>Includes dotfiles</li>
				<li>Alphabetically sorted</li>
			</ul>

			<hr />

			<h2>Custom Tools</h2>
			<p>
				You can add custom tools using the <code>tools</code> config option:
			</p>
			<pre>
				<code>{`import { CodingAgent } from "edge-pi";
import { tool } from "ai";
import { z } from "zod";

const myTool = tool({
  description: "Get the current weather",
  parameters: z.object({
    city: z.string().describe("City name"),
  }),
  execute: async ({ city }) => {
    return \`Weather in \${city}: Sunny, 72°F\`;
  },
});

const agent = new CodingAgent({
  model,
  tools: { weather: myTool },
});`}</code>
			</pre>
		</>
	);
}
