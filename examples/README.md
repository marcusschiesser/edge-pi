# Examples

Example code for pi-coding-agent SDK and extensions.

## Running Examples

All examples can be run from the repo root. Build the packages first:

```bash
npm install
npm run build
```

### SDK Examples

SDK examples are standalone scripts. Run them with `tsx`:

```bash
npx tsx examples/sdk/01-minimal.ts
npx tsx examples/sdk/05-tools.ts
```

### Extensions

Extensions are plugins loaded into the pi agent via the `--extension` flag:

```bash
# Using pi-test.sh (runs pi from sources)
./pi-test.sh --extension examples/extensions/hello.ts

# Load multiple extensions
./pi-test.sh --extension examples/extensions/hello.ts --extension examples/extensions/pirate.ts
```

## Directories

### [sdk/](sdk/)
Programmatic usage via `createAgentSession()`. Shows how to customize models, prompts, tools, extensions, and session management.

### [extensions/](extensions/)
Example extensions demonstrating:
- Lifecycle event handlers (tool interception, safety gates, context modifications)
- Custom tools (todo lists, questions, subagents, output truncation)
- Commands and keyboard shortcuts
- Custom UI (footers, headers, editors, overlays)
- Git integration (checkpoints, auto-commit)
- System prompt modifications and custom compaction
- External integrations (SSH, file watchers, system theme sync)
- Custom providers (Anthropic with custom streaming, GitLab Duo)

## Documentation

- [SDK Reference](sdk/README.md)
- [Extensions Documentation](../docs/extensions.md)
- [Skills Documentation](../docs/skills.md)
