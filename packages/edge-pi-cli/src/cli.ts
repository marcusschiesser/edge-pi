#!/usr/bin/env node
/**
 * CLI entry point for the edge-pi coding agent.
 */
process.title = "epi";

import { runCliFromSource } from "./source-runner.js";

const exitCode = runCliFromSource(process.argv.slice(2), process.env);
process.exit(exitCode);
