import { stdin as input } from "node:process";
import { runCursorCaptureImageHook } from "../harness/cursor-capture-image.js";
import { type HookClient, runUserPromptHook } from "../harness/user-prompt-hook.js";
import { getFlagString, parseArgs } from "./parse-args.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of input) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseHookClient(value: string | undefined): HookClient | undefined {
  if (!value) {
    return undefined;
  }

  switch (value.toLowerCase()) {
    case "cursor":
      return "cursor";
    case "codex":
      return "codex";
    case "claude":
      return "claude";
    case "droid":
      return "droid";
    case "generic":
      return "generic";
    default:
      throw new Error(`Unknown hook client: ${value}`);
  }
}

export async function runHookUserPromptCommand(argv: string[]): Promise<number> {
  const parsed = parseArgs(argv);
  const client = parseHookClient(getFlagString(parsed.flags, "client"));
  const mainModelRef = getFlagString(parsed.flags, "model");
  const rawInput = await readStdin();

  try {
    const result = await runUserPromptHook(rawInput, {
      client,
      mainModelRef,
      env: process.env,
    });

    if (result.stdout) {
      process.stdout.write(`${result.stdout}\n`);
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Atlas user-prompt hook failed.";
    process.stderr.write(`${message}\n`);
    return 0;
  }
}

export async function runHookCaptureImageCommand(_argv: string[]): Promise<number> {
  const rawInput = await readStdin();

  try {
    await runCursorCaptureImageHook(rawInput);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Atlas capture-image hook failed.";
    process.stderr.write(`${message}\n`);
    return 0;
  }
}
