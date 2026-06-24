#!/usr/bin/env node

import { runCliAsync } from "./run.js";

const code = await runCliAsync();

// For CLI commands (doctor, analyze, etc.) the process exits naturally
// when all async work completes. For the MCP server, stdin keeps the
// event loop alive. Only force-exit on error.
if (code !== 0) {
  process.exit(code);
}
