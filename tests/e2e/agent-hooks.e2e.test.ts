import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { runUserPromptHook } from "../../src/harness/user-prompt-hook.js";
const REPO_ROOT = resolve(import.meta.dirname, "../..");
const GOLDEN_CHART = resolve(REPO_ROOT, "tests/fixtures/golden/chart-revenue.png");
const CLI_MAIN = resolve(REPO_ROOT, "dist/cli/main.js");

function tryLoadDotenv(): void {
  const envPath = resolve(REPO_ROOT, ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function hasApiKey(): boolean {
  tryLoadDotenv();
  return Boolean(process.env.VISION_API_KEY?.trim());
}

const LIVE_ENV = (): NodeJS.ProcessEnv => ({
  ...process.env,
  ATLAS_FORCE_INTERCEPT: "false",
  ATLAS_SKIP_INTERCEPT: "false",
  MAIN_MODEL_REF: "deepseek/deepseek-v4-flash",
});

describe("E2E: agent hook live intercept", () => {
  const canRun = hasApiKey();
  const LONG_TIMEOUT = 120_000;

  it.runIf(canRun)(
    "cursor hook injects evidence for text-only model + image",
    async () => {
      const result = await runUserPromptHook(
        JSON.stringify({
          prompt: `What does this chart show? ${GOLDEN_CHART}`,
          hook_event_name: "beforeSubmitPrompt",
          cwd: REPO_ROOT,
        }),
        {
          client: "cursor",
          env: LIVE_ENV(),
        },
        { cwd: REPO_ROOT },
      );

      expect(result.intercepted).toBe(true);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.additional_context).toContain("<atlas-vision-evidence>");
      expect(parsed.additional_context.toLowerCase()).toMatch(/revenue|chart|jan|feb|mar/);
    },
    LONG_TIMEOUT,
  );

  it.runIf(canRun)(
    "droid hook injects evidence for text-only model + image",
    async () => {
      const result = await runUserPromptHook(
        JSON.stringify({
          prompt: `Describe ${GOLDEN_CHART}`,
          hook_event_name: "UserPromptSubmit",
          model: "deepseek-v4-flash",
          cwd: REPO_ROOT,
        }),
        {
          client: "droid",
          env: LIVE_ENV(),
        },
        { cwd: REPO_ROOT },
      );

      expect(result.intercepted).toBe(true);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.hookSpecificOutput.additionalContext).toContain("<atlas-vision-evidence>");
    },
    LONG_TIMEOUT,
  );

  it.runIf(canRun && existsSync(CLI_MAIN))(
    "hook CLI subprocess live intercept for codex client",
    async () => {
      const result = spawnSync(
        process.execPath,
        [CLI_MAIN, "hook", "user-prompt", "--client", "codex"],
        {
          env: LIVE_ENV(),
          cwd: REPO_ROOT,
          input: JSON.stringify({
            prompt: `Summarize ${GOLDEN_CHART}`,
            hook_event_name: "UserPromptSubmit",
            model: "deepseek-v4-flash",
            cwd: REPO_ROOT,
          }),
          encoding: "utf8",
          timeout: LONG_TIMEOUT,
        },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("hookSpecificOutput");
      expect(result.stdout).toContain("<atlas-vision-evidence>");
    },
    LONG_TIMEOUT,
  );

  it.runIf(canRun && existsSync(CLI_MAIN))(
    "cursor composer skips live vision call",
    async () => {
      const result = spawnSync(
        process.execPath,
        [CLI_MAIN, "hook", "user-prompt", "--client", "cursor"],
        {
          env: LIVE_ENV(),
          cwd: REPO_ROOT,
          input: JSON.stringify({
            prompt: `Describe ${GOLDEN_CHART}`,
            hook_event_name: "beforeSubmitPrompt",
            model: "cursor/composer-2.5",
            cwd: REPO_ROOT,
          }),
          encoding: "utf8",
          timeout: 30_000,
        },
      );

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe("");
    },
    LONG_TIMEOUT,
  );
});
