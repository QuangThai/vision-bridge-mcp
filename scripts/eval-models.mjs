#!/usr/bin/env node
/**
 * Run golden eval across multiple vision models (requires VISION_API_KEY).
 *
 * Usage:
 *   node scripts/eval-models.mjs
 *   pnpm eval:models
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const CLI = resolve(REPO_ROOT, "dist/cli/main.js");

function tryLoadDotenv() {
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

tryLoadDotenv();

if (!process.env.VISION_API_KEY?.trim()) {
  console.error("VISION_API_KEY required for multi-model eval");
  process.exit(1);
}

if (!existsSync(CLI)) {
  console.error("Build first: pnpm build");
  process.exit(1);
}

const MODEL_MATRIX = [
  { label: "gpt-4o-mini (openai-compatible)", model: "gpt-4o-mini", provider: "openai-compatible" },
  { label: "gpt-4o (openai-responses)", model: "gpt-4o", provider: "openai-responses" },
];

if (process.env.GEMINI_API_KEY?.trim() || process.env.VISION_PROVIDER === "gemini") {
  MODEL_MATRIX.push({
    label: "gemini-2.0-flash",
    model: process.env.VISION_MODEL?.trim() || "gemini-2.0-flash",
    provider: "gemini",
  });
}

console.log("Atlas Vision — multi-model golden eval\n");

let failed = 0;

for (const entry of MODEL_MATRIX) {
  console.log(`## ${entry.label}`);
  const result = spawnSync(
    process.execPath,
    [
      CLI,
      "eval",
      "--gate",
      "--threshold",
      "0.8",
      "--no-cache",
      "--tier",
      "core",
      "--model",
      entry.model,
      "--provider",
      entry.provider,
    ],
    {
      cwd: REPO_ROOT,
      env: process.env,
      encoding: "utf8",
    },
  );

  const summary = `${result.stdout}${result.stderr}`;
  const gateFailed = summary.includes("Gate failures: 0") || !summary.includes("Gate failures:");
  const ok = result.status === 0;

  console.log(ok ? "✅ PASS" : "❌ FAIL");
  if (!ok) {
    failed += 1;
    console.log(summary.slice(-800));
  }
  console.log("");
}

if (failed > 0) {
  console.error(`${failed}/${MODEL_MATRIX.length} model evals failed`);
  process.exit(1);
}

console.log(`All ${MODEL_MATRIX.length} model evals passed.`);
