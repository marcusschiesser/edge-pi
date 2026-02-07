export default function ProvidersPage() {
	return (
		<>
			<h1>Providers & Auth</h1>
			<p>
				The <code>epi</code> CLI supports three AI providers out of the box:
				Anthropic, OpenAI, and Google. Authentication is handled through API
				keys, environment variables, or OAuth.
			</p>

			<h2>Supported Providers</h2>
			<table>
				<thead>
					<tr>
						<th>Provider</th>
						<th>Flag</th>
						<th>Default Model</th>
						<th>Environment Variable</th>
					</tr>
				</thead>
				<tbody>
					<tr>
						<td>Anthropic</td>
						<td>
							<code>--provider anthropic</code>
						</td>
						<td>
							<code>claude-sonnet-4-20250514</code>
						</td>
						<td>
							<code>ANTHROPIC_API_KEY</code>
						</td>
					</tr>
					<tr>
						<td>OpenAI</td>
						<td>
							<code>--provider openai</code>
						</td>
						<td>
							<code>gpt-4o</code>
						</td>
						<td>
							<code>OPENAI_API_KEY</code>
						</td>
					</tr>
					<tr>
						<td>Google</td>
						<td>
							<code>--provider google</code>
						</td>
						<td>
							<code>gemini-2.5-flash</code>
						</td>
						<td>
							<code>GEMINI_API_KEY</code>
						</td>
					</tr>
				</tbody>
			</table>

			<h2>Provider Selection</h2>
			<p>
				The CLI determines which provider to use in this order:
			</p>
			<ol>
				<li>
					<strong>Explicit flag</strong> &mdash; <code>--provider anthropic</code>
				</li>
				<li>
					<strong>Stored credentials</strong> &mdash; From{" "}
					<code>auth.json</code> (see below)
				</li>
				<li>
					<strong>Environment variables</strong> &mdash; First available key
					wins
				</li>
			</ol>
			<p>
				If no provider can be determined, the CLI exits with an error.
			</p>

			<h2>API Key Setup</h2>

			<h3>Environment Variables</h3>
			<p>The simplest way to authenticate:</p>
			<pre>
				<code>{`# Anthropic
export ANTHROPIC_API_KEY=sk-ant-api03-...

# OpenAI
export OPENAI_API_KEY=sk-...

# Google
export GEMINI_API_KEY=...`}</code>
			</pre>

			<h3>Command-Line Override</h3>
			<p>
				Pass an API key directly (overrides all other sources):
			</p>
			<pre>
				<code>{`epi --provider anthropic --api-key sk-ant-api03-...`}</code>
			</pre>

			<h2>OAuth (Anthropic)</h2>
			<p>
				The CLI supports OAuth 2.0 with PKCE for Anthropic. This provides
				token-based authentication with automatic refresh.
			</p>

			<h3>Login</h3>
			<pre>
				<code>{`# In interactive mode:
/login

# This opens a browser for OAuth authorization via claude.ai`}</code>
			</pre>

			<h3>Logout</h3>
			<pre>
				<code>{`# In interactive mode:
/logout`}</code>
			</pre>

			<h3>OAuth Token via Environment</h3>
			<p>
				You can also provide an OAuth token directly:
			</p>
			<pre>
				<code>{`export ANTHROPIC_OAUTH_TOKEN=...`}</code>
			</pre>
			<blockquote>
				<p>
					<strong>Note:</strong> The <code>ANTHROPIC_OAUTH_TOKEN</code>{" "}
					environment variable takes precedence over{" "}
					<code>ANTHROPIC_API_KEY</code>.
				</p>
			</blockquote>

			<h2>Credential Storage</h2>
			<p>
				Credentials are stored in{" "}
				<code>~/.pi/agent/auth.json</code> (or{" "}
				<code>$PI_CODING_AGENT_DIR/auth.json</code>).
			</p>

			<h3>Credential Types</h3>
			<p>
				<strong>API Key:</strong>
			</p>
			<pre>
				<code>{`{
  "type": "api_key",
  "key": "sk-ant-api03-..."
}`}</code>
			</pre>
			<p>
				<strong>OAuth:</strong>
			</p>
			<pre>
				<code>{`{
  "type": "oauth",
  "access": "<access_token>",
  "refresh": "<refresh_token>",
  "expires": 1705123456
}`}</code>
			</pre>

			<h3>Resolution Priority</h3>
			<p>
				When resolving credentials for a provider, the CLI checks in this order:
			</p>
			<ol>
				<li>
					Runtime override (<code>--api-key</code> flag)
				</li>
				<li>
					Stored API key in <code>auth.json</code>
				</li>
				<li>OAuth token with automatic refresh</li>
				<li>Environment variable</li>
			</ol>

			<h2>Choosing a Model</h2>
			<p>
				Each provider has a default model. Override it with{" "}
				<code>--model</code>:
			</p>
			<pre>
				<code>{`# Anthropic models
epi --provider anthropic --model claude-sonnet-4-20250514
epi --provider anthropic --model claude-opus-4-20250514

# OpenAI models
epi --provider openai --model gpt-4o
epi --provider openai --model gpt-4o-mini

# Google models
epi --provider google --model gemini-2.5-flash
epi --provider google --model gemini-2.5-pro`}</code>
			</pre>

			<h2>Configuration Directory</h2>
			<p>
				By default, the CLI stores configuration in{" "}
				<code>~/.pi/agent/</code>. Override with the{" "}
				<code>PI_CODING_AGENT_DIR</code> environment variable:
			</p>
			<pre>
				<code>{`export PI_CODING_AGENT_DIR=/path/to/custom/config
epi`}</code>
			</pre>
			<p>
				This directory contains:
			</p>
			<pre>
				<code>{`~/.pi/agent/
├── auth.json      # Stored credentials
├── sessions/      # Session files (organized by project)
└── skills/        # User-defined skills`}</code>
			</pre>
		</>
	);
}
