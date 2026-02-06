/**
 * Shutdown Command Extension
 *
 * Adds a /quit command that allows extensions to trigger clean shutdown.
 * Demonstrates how extensions can use ctx.shutdown() to exit pi cleanly.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { z } from "zod";

export default function (pi: ExtensionAPI) {
	// Register a /quit command that cleanly exits pi
	pi.registerCommand("quit", {
		description: "Exit pi cleanly",
		handler: async (_args, ctx) => {
			ctx.shutdown();
		},
	});

	// You can also create a tool that shuts down after completing work
	pi.registerTool({
		name: "finish_and_exit",
		label: "Finish and Exit",
		description: "Complete a task and exit pi",
		parameters: z.object({}),
		async execute(_input, options) {
			const { ctx } = options;
			// Do any final work here...
			// Request graceful shutdown (deferred until agent is idle)
			ctx.shutdown();

			// This return is sent to the LLM before shutdown occurs
			return {
				content: [{ type: "text", text: "Shutdown requested. Exiting after this response." }],
				details: {},
			};
		},
	});

	// You could also create a more complex tool with parameters
	pi.registerTool({
		name: "deploy_and_exit",
		label: "Deploy and Exit",
		description: "Deploy the application and exit pi",
		parameters: z.object({
			environment: z.string().describe("Target environment (e.g., production, staging)"),
		}),
		async execute(input, options) {
			const { ctx, onUpdate } = options;
			onUpdate?.({ content: [{ type: "text", text: `Deploying to ${input.environment}...` }], details: {} });

			// Example deployment logic
			// const result = await pi.exec("npm", ["run", "deploy", input.environment], { signal });

			// On success, request graceful shutdown
			onUpdate?.({ content: [{ type: "text", text: "Deployment complete, exiting..." }], details: {} });
			ctx.shutdown();

			return {
				content: [{ type: "text", text: "Done! Shutdown requested." }],
				details: { environment: input.environment },
			};
		},
	});
}
