# Examples

Example code for edge-pi.

## Running Examples

All examples can be run from the repo root. Build the packages first:

```bash
npm install
npm run build
```

### Examples

Examples are standalone scripts. Run them with `tsx`:

```bash
npx tsx examples/01-simple.ts
npx tsx examples/02-streaming.ts
npx tsx examples/03-pwa-nutrition-scanner.ts
npx tsx examples/04-streaming-events.ts
npx tsx examples/05-all-tools.ts
npx tsx examples/06-web-search-tool.ts
npx tsx examples/07-sessions.ts
npx tsx examples/08-compaction.ts
```

Browser example (Vite + WebContainer):

```bash
cd examples/vite-browser-agent
npm install
npm run dev
```

## Directories

Examples in this directory demonstrate:

- Non-streaming vs streaming usage
- Observing tool loop events via `fullStream`
- Enabling the full built-in tool set (`toolSet: "all"`)
- Adding a custom tool (web search)
- Generating a complete PWA (Progressive Web App)
- Session persistence with CodingAgent
- Built-in context compaction (auto + manual)
- Running CodingAgent in the browser with WebContainer (`examples/vite-browser-agent`)

## Documentation

- SDK docs: ../docs (see repo docs site)
