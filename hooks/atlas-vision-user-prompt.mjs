#!/usr/bin/env node
/**
 * Atlas Vision user-prompt hook entrypoint for coding-agent hooks.
 * Reads hook JSON from stdin, runs vision intercept, writes client JSON to stdout.
 */
import { stdin as input } from "node:process";
import { runUserPromptHook } from "../dist/index.js";

function parseClient(argv) {
  const index = argv.indexOf("--client");
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of input) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const rawInput = await readStdin();
const client = parseClient(process.argv.slice(2));

try {
  const result = await runUserPromptHook(rawInput, {
    client,
    env: process.env,
  });

  if (result.stdout) {
    process.stdout.write(`${result.stdout}\n`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Atlas user-prompt hook failed.";
  process.stderr.write(`${message}\n`);
}
