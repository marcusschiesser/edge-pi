/**
 * Web Search Tool Example
 *
 * Demonstrates adding a custom "webSearch" tool via the CodingAgent `tools` option.
 *
 * This example uses DuckDuckGo's HTML endpoint (no API key).
 * Note: HTML scraping is inherently brittle; treat this as a demo only.
 */

import { anthropic } from "@ai-sdk/anthropic";
import { tool } from "ai";
import { CodingAgent } from "edge-pi";
import { z } from "zod";
import { printStream } from "./utils.js";

const model = anthropic("claude-sonnet-4-5-20250929");

async function duckDuckGoSearch(query: string, maxResults: number): Promise<Array<{ title: string; url: string }>> {
	const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
	const res = await fetch(url, {
		headers: {
			"user-agent": "edge-pi-example/1.0 (+https://github.com/marcusschiesser/edge-pi)",
		},
	});

	if (!res.ok) {
		throw new Error(`DuckDuckGo request failed: ${res.status} ${res.statusText}`);
	}

	const html = await res.text();

	// Very small/naive extraction: look for result links.
	// Example snippet contains: <a rel="nofollow" class="result__a" href="...">Title</a>
	const results: Array<{ title: string; url: string }> = [];
	const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;

	let m: RegExpExecArray | null = re.exec(html);
	while (m && results.length < maxResults) {
		const link = m[1] ?? "";
		const rawTitle = m[2] ?? "";
		const title = rawTitle
			.replace(/<[^>]+>/g, "")
			.replace(/&amp;/g, "&")
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.trim();

		if (link && title) {
			results.push({ title, url: link });
		}

		m = re.exec(html);
	}

	return results;
}

const webSearch = tool({
	description: "Search the web for a query and return top results.",
	inputSchema: z.object({
		query: z.string().describe("Search query"),
		maxResults: z.number().int().min(1).max(10).default(5).describe("Max results to return"),
	}),
	execute: async ({ query, maxResults }): Promise<{ results: Array<{ title: string; url: string }> }> => {
		const results = await duckDuckGoSearch(query, maxResults);
		return { results };
	},
});

const agent = new CodingAgent({
	model,
	tools: {
		webSearch,
	},
});

console.log("Running agent with a custom webSearch tool...\n");

const result = await agent.stream({
	prompt: "Search the web for the Vercel AI SDK ToolSet type and summarize what it represents. Include 3 links.",
});

await printStream(result);
