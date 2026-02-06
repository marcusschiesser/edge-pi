/**
 * Hello Tool - Minimal custom tool example
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { z } from "zod";

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "hello",
		label: "Hello",
		description: "A simple greeting tool",
		parameters: z.object({
			name: z.string().describe("Name to greet"),
		}),

		async execute(input, _options) {
			const { name } = input as { name: string };
			return {
				content: [{ type: "text", text: `Hello, ${name}!` }],
				details: { greeted: name },
			};
		},
	});
}
