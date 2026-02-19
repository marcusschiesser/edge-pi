/**
 * Session Persistence Example
 *
 * Demonstrates how CodingAgent integrates with SessionManager for
 * automatic message persistence. Creates an agent, runs a prompt,
 * then creates a second agent with the same session to show that
 * conversation state is restored automatically.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { stepCountIs } from "ai";
import { CodingAgent } from "edge-pi";
import { createNodeRuntime } from "edge-pi/node";
import { SessionManager } from "edge-pi/session";

const model = anthropic("claude-sonnet-4-5-20250929");
const cwd = process.cwd();
const sessionsDir = "./sessions";

// Create a session manager (persists to ./sessions/)
const session = SessionManager.create(cwd, sessionsDir);

// --- First agent: ask a question ---
const agent1 = new CodingAgent({
	model,
	runtime: createNodeRuntime(),
	stopWhen: stepCountIs(3),
	sessionManager: session,
});

console.log("Agent 1: asking a question...\n");

const result1 = await agent1.generate({
	prompt: "What files are in the current directory? List them briefly.",
});

console.log("--- Agent 1 Response ---");
console.log(result1.text);
console.log(`\nMessages after agent 1: ${session.getEntries().length}`);

// --- Second agent: same session, state is restored ---
const agent2 = new CodingAgent({
	model,
	runtime: createNodeRuntime(),
	stopWhen: stepCountIs(3),
	sessionManager: session,
});

console.log(`\nAgent 2 restored ${agent2.messages.length} messages from session`);
console.log("Agent 2: asking a follow-up...\n");

const result2 = await agent2.generate({
	prompt: "Which of those files is the largest?",
});

console.log("--- Agent 2 Response ---");
console.log(result2.text);
console.log(`\nSession file: ${session.getSessionFile()}`);
console.log(`Total messages in session: ${session.getEntries().length}`);
