import type { EdgePiRuntime } from "./types.js";

export function createNodeRuntime(): EdgePiRuntime {
	throw new Error(
		"createNodeRuntime is unavailable in browser builds. Pass a runtime explicitly, for example createWebContainerRuntime(...).",
	);
}
