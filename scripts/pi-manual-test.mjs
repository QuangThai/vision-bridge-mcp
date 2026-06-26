#!/usr/bin/env node
/**
 * Live Pi CLI manual sign-off: extension intercept vs vision-native skip.
 *
 * Usage:
 *   node scripts/pi-manual-test.mjs
 *   pnpm pi:manual
 *
 * Requires: pi CLI, VISION_API_KEY in .env, pi auth for opencode-go (+ openai optional).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const EXT = resolve(REPO_ROOT, "extensions/atlas-vision-intercept.ts");
const CHART = resolve(REPO_ROOT, "tests/fixtures/golden/chart-revenue.png");
const PROMPT =
  "What is the Monthly Revenue for January, February, and March in this chart? Reply with only the three dollar amounts.";

const CLEAN_ENV = {
  ...process.env,
  ATLAS_FORCE_INTERCEPT: "false",
  ATLAS_SKIP_INTERCEPT: "false",
  MAIN_MODEL_REF: "",
};

function loadDotenv() {
  const envPath = resolve(REPO_ROOT, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in CLEAN_ENV)) CLEAN_ENV[key] = value;
  }

  if (CLEAN_ENV.OPENAI_KEY && !CLEAN_ENV.OPENAI_API_KEY) {
    CLEAN_ENV.OPENAI_API_KEY = CLEAN_ENV.OPENAI_KEY;
  }
  if (CLEAN_ENV.GEMINI_KEY && !CLEAN_ENV.GEMINI_API_KEY) {
    CLEAN_ENV.GEMINI_API_KEY = CLEAN_ENV.GEMINI_KEY;
  }
}

function hasVisionKey() {
  loadDotenv();
  return Boolean(CLEAN_ENV.VISION_API_KEY?.trim());
}

function resolvePiBin() {
  if (process.env.PI_BIN?.trim()) {
    return process.env.PI_BIN.trim();
  }

  const candidates = [
    resolve(homedir(), "AppData/Roaming/npm/pi.cmd"),
    resolve(homedir(), "AppData/Roaming/npm/pi"),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return "pi";
}

const PI_BIN = resolvePiBin();

function piAvailable() {
  const check = spawnSync(PI_BIN, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    shell: process.platform === "win32",
  });
  return check.status === 0;
}

function runPiCase({ label, model, expectIntercept, extraEnv = {}, timeoutMs = 240_000 }) {
  console.log(`\n## ${label}`);
  console.log(`   model=${model}, expect intercept=${expectIntercept}`);

  const args = [
    "-e",
    EXT,
    "-p",
    "--no-session",
    "--no-tools",
    "--mode",
    "json",
    "--model",
    model,
    `@${CHART}`,
    PROMPT,
  ];

  const started = Date.now();
  const result = spawnSync(PI_BIN, args, {
    env: { ...CLEAN_ENV, ...extraEnv },
    cwd: REPO_ROOT,
    encoding: "buffer",
    timeout: timeoutMs,
    maxBuffer: 512 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const output = Buffer.concat([
    result.stdout ?? Buffer.alloc(0),
    result.stderr ?? Buffer.alloc(0),
  ]).toString("utf8");

  if (result.error) {
    console.log(`❌ pi failed (${elapsed}s): ${result.error.message}`);
    return false;
  }

  const hasEvidence =
    output.includes("atlas-vision-evidence") ||
    output.includes('"customType":"atlas-vision-evidence"') ||
    output.includes('"customType": "atlas-vision-evidence"');

  const hasRevenueHint = /(?:\$|\b)(12|18|24)[kK]?\b/i.test(output);
  const ok = expectIntercept ? hasEvidence : !hasEvidence;

  console.log(
    `${ok ? "✅" : "❌"} ${expectIntercept ? "intercepted" : "skipped"} (${elapsed}s, exit ${result.status ?? "?"})`,
  );
  console.log(`   evidence block: ${hasEvidence ? "yes" : "no"}`);
  console.log(`   revenue hint in output: ${hasRevenueHint ? "yes" : "no"}`);

  if (!ok) {
    console.log("\n--- output snippet ---");
    console.log(output.slice(0, 4000));
  }

  return ok;
}

if (!existsSync(EXT)) {
  console.error("Extension missing:", EXT);
  process.exit(1);
}
if (!existsSync(CHART)) {
  console.error("Fixture missing:", CHART);
  process.exit(1);
}
if (!piAvailable()) {
  console.error("pi CLI not found (set PI_BIN or install pi globally)");
  process.exit(1);
}
if (!hasVisionKey()) {
  console.error("VISION_API_KEY required (set in .env or env)");
  process.exit(1);
}

console.log("Atlas Vision — Pi CLI live manual test");
console.log(`Pi binary: ${PI_BIN}`);
console.log(`Fixture: ${CHART}`);

let failed = 0;

if (
  !runPiCase({
    label: "Text-only (opencode-go/deepseek-v4-flash) + image → intercept",
    model: "opencode-go/deepseek-v4-flash",
    expectIntercept: true,
  })
) {
  failed++;
}

if (
  !runPiCase({
    label: "Vision-native (opencode-go/kimi-k2.6) + image → skip via ctx.model.input",
    model: "opencode-go/kimi-k2.6",
    expectIntercept: false,
  })
) {
  failed++;
}

if (CLEAN_ENV.OPENAI_API_KEY?.trim()) {
  if (
    !runPiCase({
      label: "Vision model (openai/gpt-4o) + image → skip intercept",
      model: "openai/gpt-4o",
      expectIntercept: false,
    })
  ) {
    failed++;
  }
} else {
  console.log("\n## Vision model (openai/gpt-4o) — skipped (no OPENAI_API_KEY)");
}

if (
  !runPiCase({
    label: "Composer + MAIN_MODEL_REF footgun → skip intercept",
    model: "cursor/composer-2.5",
    expectIntercept: false,
    extraEnv: { MAIN_MODEL_REF: "opencode-go/deepseek-v4-flash" },
    timeoutMs: 420_000,
  })
) {
  failed++;
}

console.log(failed ? `\n${failed} case(s) failed.` : "\nAll Pi manual checks passed.");
process.exit(failed ? 1 : 0);
