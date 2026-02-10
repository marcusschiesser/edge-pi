/**
 * PWA Nutrition Label Scanner
 *
 * Converted from the old SDK example. Uses edge-pi's CodingAgent with
 * streaming to generate a complete PWA that scans nutrition labels.
 */

import { openai } from "@ai-sdk/openai";
import { stepCountIs } from "ai";
import { CodingAgent } from "edge-pi";
import { printStream } from "./utils.js";

const model = openai("gpt-5.2-codex");

const PROMPT = `Make an app to scan the nutrition label (macros and ingredients list) of any food packaging using the camera. The label could be in any language. Use AI to extract calories, protein, fat, carbs and each ingredient and translate them to English. While doing so show a funny progress bar. Then display to the user an aggregated health score together with a funny witty verdict of the health value of the food from the point of view of Bryan Johnson. Below that show calories, protein, fat, carbs, and below that the ingredient list. Next to each ingredient show a health score from 0-10, 10 being the best. Below each ingredient explain in one sentence in easy language what it is.`;

const agent = new CodingAgent({
	model,
	stopWhen: stepCountIs(30),
});

console.log("Generating PWA Nutrition Label Scanner...\n");

const result = await agent.stream({
	prompt: `${PROMPT}

Create a PWA using, TypeScript, Tailwind CSS, React and Vite, include a complete, runnable project with:
- package.json with scripts
- index.html
- src folder with components, pages, utils, types, etc.
- Tailwind CSS styles
- public/manifest.webmanifest
- public/icons (generate placeholder icons as SVG or PNG)
- service worker (register it)

Keep dependencies minimal.
After writing files, print a short summary and the exact command to run the app.`,
});

await printStream(result);
