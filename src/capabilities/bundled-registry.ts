/**
 * bundled-registry.ts — Provider heuristics + model capability overrides.
 *
 * ## Design rationale
 *
 * Atlas uses **provider-level heuristics** only for REAL providers where ALL
 * models are consistently vision-native or consistently text-only.
 *
 *   - `openai/*`, `openai-codex/*`, `anthropic/*`, `google/*` → ALL models have vision
 *   - `deepseek/*`, `zai/*`, `kimi/*` → ALL models are text-only
 *
 * Providers with mixed capabilities (e.g. `opencode`, `opencode-go` which serve
 * both deepseek text-only and minimax vision models) are deliberately excluded.
 * For those, the pi extension path (`ctx.model.input`) is always correct, while
 * the MCP server path requires `MAIN_MODEL_REF` to resolve capabilities via
 * models.dev or user overrides.
 *
 * Specific overrides handle the rare case where a provider has mixed models
 * (e.g. ZhipuAI's GLM-5V-Turbo has vision but GLM-5.2 is text-only).
 *
 * Users can extend via `ATLAS_MODEL_CAPABILITIES_FILE` env var.
 *
 * ## Priority chain
 *
 *   runtimeSupportsVision (pi ctx.model.input) — absolute truth when set
 *     → ATLAS_MODEL_CAPABILITIES_FILE (user config)
 *     → Specific overrides (this file, per-model exceptions)
 *     → Provider heuristics (this file, provider-wide defaults)
 *     → models.dev catalog (remote)
 *     → Unknown policy (ATLAS_INTERCEPT_MODE)
 */

import { access, readFile } from "node:fs/promises";
import type { ProviderVisionPattern, VisionCapabilityOverride } from "./types.js";

// ══════════════════════════════════════════════════════════
// Provider-level heuristics (covers ALL models, no update needed)
// ══════════════════════════════════════════════════════════
//
// Priority: lower = higher priority
//   0-9:   Provider-wide defaults (the patterns below)
//   10-19: Provider-specific exceptions
//   20+:   Model-specific edge case overrides
//
// TRUE  = "ALL models from this provider have vision" → skip intercept
// FALSE = "ALL models from this provider are text-only" → intercept
// (remove entry = "check models.dev or config")
//
// IMPORTANT: These are provider-level DEFAULTS. When a provider
// releases both text-only AND vision models (uncommon for major
// providers), use specific overrides below instead.

export const PROVIDER_HEURISTICS: ProviderVisionPattern[] = [
  // ── Vision-native providers ──
  { providerId: "openai", modelGlob: "*", supportsVision: true, priority: 0 },
  // openai-codex (ChatGPT via pi): ALL models (gpt-4o, gpt-5.5, o3, etc.) have vision
  { providerId: "openai-codex", modelGlob: "*", supportsVision: true, priority: 0 },
  { providerId: "anthropic", modelGlob: "*", supportsVision: true, priority: 0 },
  { providerId: "google", modelGlob: "*", supportsVision: true, priority: 0 },
  { providerId: "amazon", modelGlob: "*", supportsVision: true, priority: 0 }, // Nova series
  { providerId: "mistral", modelGlob: "*", supportsVision: true, priority: 0 }, // Pixtral, Mistral Large
  // azure-openai-responses: ALL Azure OpenAI models have vision
  { providerId: "azure-openai-responses", modelGlob: "*", supportsVision: true, priority: 0 },

  // ── Text-only providers ──
  // DeepSeek: V4 Flash/Pro may claim vision in models.dev but does NOT
  // work in practice (opencode issue #26103 confirmed). Remain text-only.
  { providerId: "deepseek", modelGlob: "*", supportsVision: false, priority: 1 },
  // Z.ai (ZhipuAI) GLM series: confirmed text-only (GLM-4.x, 5.x — no image modality)
  // Note: GLM-5V-Turbo is an exception with vision (handled via specific override below).
  { providerId: "zai", modelGlob: "*", supportsVision: false, priority: 1 },
  // Kimi: text-only
  { providerId: "kimi", modelGlob: "*", supportsVision: false, priority: 1 },
  // Qwen (non-VL): text-only. Qwen-VL is separate.
  { providerId: "qwen", modelGlob: "qwen*-vl*", supportsVision: true, priority: 0 }, // VL = vision
  { providerId: "qwen", modelGlob: "*", supportsVision: false, priority: 1 }, // non-VL = text-only

  // ── Proxy providers deliberately excluded ──
  // cursor, opencode, opencode-go are PROXY providers — they can route to
  // ANY upstream model. Capabilities depend on the underlying model, not the
  // proxy. Users MUST set MAIN_MODEL_REF to the real model for these.
  // Without it, lookup falls to models.dev or "unknown" → safe default (intercept).
];

// ══════════════════════════════════════════════════════════
// Specific overrides (only for exceptions to provider defaults)
// ══════════════════════════════════════════════════════════
// These override the provider heuristic. Only add entries when
// a specific model from the provider differs from the default.

export const SPECIFIC_OVERRIDES: VisionCapabilityOverride[] = [
  // DeepSeek V4 series: models.dev may claim vision but it doesn't work
  {
    modelId: "deepseek-v4-flash",
    providerId: "deepseek",
    supportsVision: false,
    source: "bundled",
  },
  { modelId: "deepseek-v4-pro", providerId: "deepseek", supportsVision: false, source: "bundled" },
  {
    modelId: "DeepSeek-V4-Flash",
    providerId: "deepseek",
    supportsVision: false,
    source: "bundled",
  },
  { modelId: "DeepSeek-V4-Pro", providerId: "deepseek", supportsVision: false, source: "bundled" },

  // Z.ai (ZhipuAI) GLM series: most are text-only, but GLM-5V-Turbo has vision
  { modelId: "glm-5.1", providerId: "zai", supportsVision: false, source: "bundled" },
  { modelId: "glm-5.2", providerId: "zai", supportsVision: false, source: "bundled" },
  { modelId: "glm-5v-turbo", providerId: "zai", supportsVision: true, source: "bundled" },
];

// ══════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════

function globMatch(pattern: string, value: string): boolean {
  if (pattern === "*") return true;
  // Convert glob to regex: * → .*, ? → .
  const regex = new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")}$`,
    "i",
  );
  return regex.test(value);
}

/**
 * Look up a model in the provider heuristics (patterns).
 * Returns the best-matching pattern (highest priority = lowest number).
 */
export function findHeuristicPattern(
  providerId: string,
  modelId: string,
): ProviderVisionPattern | null {
  const normProvider = providerId.trim().toLowerCase();
  const normModel = modelId.trim().toLowerCase();

  let best: ProviderVisionPattern | null = null;

  for (const pattern of PROVIDER_HEURISTICS) {
    if (pattern.providerId.toLowerCase() !== normProvider) continue;
    if (!globMatch(pattern.modelGlob, normModel)) continue;

    if (!best || pattern.priority < best.priority) {
      best = pattern;
    }
  }

  return best;
}

/**
 * Look up a model in the specific overrides list.
 * Exact match (case-insensitive) on modelId, optionally providerId.
 */
export function findSpecificOverride(
  providerId: string,
  modelId: string,
): VisionCapabilityOverride | null {
  const normProvider = providerId.trim().toLowerCase();
  const normModel = modelId.trim().toLowerCase();

  for (const entry of SPECIFIC_OVERRIDES) {
    const entryModel = entry.modelId.trim().toLowerCase();
    if (entryModel !== normModel) continue;
    if (entry.providerId && entry.providerId.trim().toLowerCase() !== normProvider) continue;
    return entry;
  }

  return null;
}

/**
 * Full lookup: heuristic first, then specific override.
 * Used by ModelsDevClient.
 */
export function lookupBundledCapability(
  providerId: string,
  modelId: string,
): { supportsVision: boolean; source: "heuristic" | "bundled" } | null {
  // 1. Specific overrides (higher priority)
  const specific = findSpecificOverride(providerId, modelId);
  if (specific) {
    return { supportsVision: specific.supportsVision, source: "bundled" };
  }

  // 2. Provider heuristics
  const heuristic = findHeuristicPattern(providerId, modelId);
  if (heuristic) {
    return { supportsVision: heuristic.supportsVision, source: "heuristic" };
  }

  return null;
}

// ══════════════════════════════════════════════════════════
// External config file
// ══════════════════════════════════════════════════════════
//
// Users can create a JSON file with per-model overrides:
//
// ```json
// {
//   "overrides": [
//     { "providerId": "deepseek", "modelId": "deepseek-v4-flash", "supportsVision": false },
//     { "providerId": "custom", "modelId": "my-new-vision-model", "supportsVision": true }
//   ]
// }
// ```
//
// Set `ATLAS_MODEL_CAPABILITIES_FILE` env var to point to the file.

/**
 * Load external model overrides from a JSON file.
 * Returns empty array if file doesn't exist or can't be read.
 */
export async function loadExternalModelOverrides(
  env: NodeJS.ProcessEnv = process.env,
): Promise<VisionCapabilityOverride[]> {
  const filePath = env.ATLAS_MODEL_CAPABILITIES_FILE?.trim();
  if (!filePath) return [];

  try {
    await access(filePath);
    const content = await readFile(filePath, "utf8");
    const parsed = JSON.parse(content);
    const overrides = parsed.overrides ?? parsed ?? [];
    if (!Array.isArray(overrides)) return [];
    return overrides as VisionCapabilityOverride[];
  } catch {
    return [];
  }
}
