# Edge-Pi

[Edge-Pi](/packages/edge-pi) is a lightweight, [Vercel AI SDK](https://sdk.vercel.ai) based coding agent library.

It provides the core primitives for building AI-powered coding assistants with tool support, session management, and context compaction. Think of it as an replacement for the proprietary [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview) by Anthropic but for any LLM provider and with the flexibility of the Vercel AI SDK.

The `epi` [CLI](/packages/edge-pi-cli) is a full-featured coding agent that features: multi-provider support, skills. It is a proof of concept that shows how to use the SDK to build a full-featured coding agent.

Code is based on the [pi coding agent](https://github.com/badlogic/pi-mono) by Mario Zechner.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines and [AGENTS.md](AGENTS.md) for project-specific rules (for both humans and agents).

## Development

```bash
npm install          # Install all dependencies
npm run build        # Build all packages
npm run check        # Lint, format, and type check
./test.sh            # Run tests (skips LLM-dependent tests without API keys)
./epi.sh             # Run epi from sources (must be run from repo root)
```

> **Note:** `npm run check` requires `npm run build` to be run first.

## License

MIT
