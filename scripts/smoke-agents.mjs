#!/usr/bin/env node
/**
 * Smoke-test agent integration routing without requiring a vision API key.
 * Live hook intercept (needs VISION_API_KEY) is in tests/e2e/agent-hooks.e2e.test.ts.
 *
 * Usage:
 *   node scripts/smoke-agents.mjs
 *   pnpm smoke:agents
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const CLI = resolve(REPO_ROOT, "dist/cli/main.js");
const CHART = resolve(REPO_ROOT, "tests/fixtures/golden/chart-revenue.png");

const CLEAN_ENV = {
  ...process.env,
  ATLAS_FORCE_INTERCEPT: "false",
  ATLAS_SKIP_INTERCEPT: "false",
  MAIN_MODEL_REF: "",
};

function runShouldIntercept(modelRef, expectPass) {
  const result = spawnSync(process.execPath, [CLI, "should-intercept", modelRef], {
    env: CLEAN_ENV,
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
  const output = `${result.stdout}${result.stderr}`;
  const isPass = output.includes("Decision:  PASS");
  const ok = expectPass ? isPass : !isPass;
  console.log(
    `${ok ? "✅" : "❌"} should-intercept ${modelRef} → ${expectPass ? "PASS" : "INTERCEPT"}`,
  );
  if (!ok) {
    console.log(output);
    process.exitCode = 1;
  }
}

function runHook(client, payload, expectEmpty, extraEnv = {}) {
  const result = spawnSync(process.execPath, [CLI, "hook", "user-prompt", "--client", client], {
    env: { ...CLEAN_ENV, ...extraEnv },
    cwd: REPO_ROOT,
    input: JSON.stringify(payload),
    encoding: "utf8",
  });
  const stdout = result.stdout.trim();
  const ok = expectEmpty ? stdout === "" : stdout.includes("atlas-vision-evidence");
  console.log(
    `${ok ? "✅" : "❌"} hook ${client} ${expectEmpty ? "skip" : "intercept"} (${payload.model ?? "n/a"})`,
  );
  if (!ok) {
    console.log("stdout:", stdout || "(empty)");
    console.log("stderr:", result.stderr);
    process.exitCode = 1;
  }
}

if (!existsSync(CLI)) {
  console.error("Build first: pnpm build");
  process.exit(1);
}

console.log("Atlas Vision — agent routing smoke\n");

console.log("## should-intercept matrix");
runShouldIntercept("cursor/composer-2.5", true);
runShouldIntercept("openai/gpt-4o", true);
runShouldIntercept("deepseek/deepseek-v4-flash", false);
runShouldIntercept("zhipuai/glm-5.2", false);

console.log("\n## hook routing (no API key)");
runHook(
  "cursor",
  {
    prompt: `check ${CHART}`,
    hook_event_name: "beforeSubmitPrompt",
    model: "cursor/composer-2.5",
    cwd: REPO_ROOT,
  },
  true,
  { MAIN_MODEL_REF: "cursor/composer-2.5" },
);
runHook(
  "droid",
  {
    prompt: `check ${CHART}`,
    hook_event_name: "UserPromptSubmit",
    model: "deepseek-v4-flash",
    supports_vision: true,
    cwd: REPO_ROOT,
  },
  true,
  { MAIN_MODEL_REF: "deepseek/deepseek-v4-flash" },
);

console.log("\n## CLI availability");
for (const cmd of ["pi", "droid"]) {
  try {
    execFileSync(cmd, ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    console.log(`✅ ${cmd} CLI found`);
  } catch {
    console.log(`⚠️  ${cmd} CLI not in PATH (optional)`);
  }
}

console.log("\n## Manual live checks (require VISION_API_KEY)");
console.log("pnpm test:e2e -- tests/e2e/agent-hooks.e2e.test.ts");
console.log(
  `pi -e ./extensions/atlas-vision-intercept.ts -p --model deepseek/deepseek-v4-flash "describe ${CHART}"`,
);

if (process.exitCode) {
  process.exit(process.exitCode);
}

console.log("\nAll routing smoke checks passed.");
