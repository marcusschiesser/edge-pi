#!/usr/bin/env node
/**
 * CLI entry point for the edge-pi coding agent.
 */
process.title = "epi";

import { main } from "./main.js";

main(process.argv.slice(2));
