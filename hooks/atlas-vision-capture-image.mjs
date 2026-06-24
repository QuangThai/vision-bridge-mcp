#!/usr/bin/env node
import { stdin as input } from "node:process";
import { runCursorCaptureImageHook } from "../dist/index.js";

async function readStdin() {
  const chunks = [];
  for await (const chunk of input) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

try {
  await runCursorCaptureImageHook(await readStdin());
} catch (error) {
  const message = error instanceof Error ? error.message : "Atlas capture-image hook failed.";
  process.stderr.write(`${message}\n`);
}
