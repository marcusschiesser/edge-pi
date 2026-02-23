/**
 * Memory Runtime Example
 *
 * Demonstrates running CodingAgent with a virtual in-memory filesystem and
 * no exec capability. The agent gets read, edit, and write tools — bash is
 * automatically excluded because exec is absent.
 *
 * Useful for testing agents without touching the real filesystem, sandboxed
 * environments, and browser contexts where shell access is unavailable.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { stepCountIs } from "ai";
import { CodingAgent, createMemoryRuntime } from "edge-pi";
import { printStream } from "./utils.js";

const runtime = createMemoryRuntime({
	initialFiles: {
		"README.md": `# Virtual Project

A simple project living entirely in memory.

## Modules

- **math.ts** — arithmetic utilities
- **string.ts** — string helpers
- **index.ts** — re-exports everything
`,
		"src/math.ts": `export const add = (a: number, b: number) => a + b;
export const subtract = (a: number, b: number) => a - b;
export const multiply = (a: number, b: number) => a * b;
export const divide = (a: number, b: number) => {
  if (b === 0) throw new Error("Division by zero");
  return a / b;
};
`,
		"src/string.ts": `export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const truncate = (s: string, max: number) => (s.length > max ? \`\${s.slice(0, max)}...\` : s);
export const words = (s: string) => s.trim().split(/\\s+/);
`,
		"src/index.ts": `export * from "./math.js";
export * from "./string.js";
`,
		"src/math.test.ts": `import { add, subtract, multiply, divide } from "./math.js";

test("add", () => expect(add(1, 2)).toBe(3));
test("subtract", () => expect(subtract(5, 3)).toBe(2));
test("multiply", () => expect(multiply(3, 4)).toBe(12));
test("divide", () => expect(divide(10, 2)).toBe(5));
test("divide by zero", () => expect(() => divide(1, 0)).toThrow());
`,
	},
});

const agent = new CodingAgent({
	model: anthropic("claude-sonnet-4-5-20250929"),
	runtime,
	stopWhen: stepCountIs(8),
});

console.log("Running agent against memory runtime (no exec)...\n");

const result = await agent.stream({
	prompt:
		"Explore this project and give me a brief overview: what files exist, what each module exports, and whether the test file covers all exported functions from math.ts.",
});

await printStream(result);
