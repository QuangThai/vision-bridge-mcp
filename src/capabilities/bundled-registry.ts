/**
 * bundled-registry.ts — Provider heuristics + model capability overrides.
 *
 * ## Design rationale
 *
 * Hardcoding every model is fragile and outdated on arrival.
 * Instead, Atlas uses **provider-level heuristics**:
 *
 *   - `openai/*`, `anthropic/*`, `google/*` → ALL models have vision
 *   - `deepseek/*`, `zhipuai/*`, `kimi/*` → ALL models are text-only
 *
 * This covers ALL current and future models from these providers
 * without needing updates. Only add specific overrides when a
 * provider's default modality changes.
 *
 * Users can extend via `ATLAS_MODEL_CAPABILITIES_FILE` env var.
 *
 * ## Priority chain
 *
 *   runtimeSupportsVision (pi ctx.model.input)
 *     → ATLAS_MODEL_CAPABILITIES_FILE (user config)
 *     → Provider heuristics (this file)
 *     → models.dev catalog (remote)
 *     → Specific overrides (this file, edge cases)
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
  { providerId: "anthropic", modelGlob: "*", supportsVision: true, priority: 0 },
  { providerId: "google", modelGlob: "*", supportsVision: true, priority: 0 },
  { providerId: "amazon", modelGlob: "*", supportsVision: true, priority: 0 }, // Nova series
  { providerId: "mistral", modelGlob: "*", supportsVision: true, priority: 0 }, // Pixtral, Mistral Large

  // ── Text-only providers ──
  // DeepSeek: V4 Flash/Pro may claim vision in models.dev but does NOT
  // work in practice (opencode issue #26103 confirmed). Remain text-only.
  { providerId: "deepseek", modelGlob: "*", supportsVision: false, priority: 1 },
  // ZhipuAI GLM series: confirmed text-only (GLM-4.x, 5.x — no image modality)
  { providerId: "zhipuai", modelGlob: "*", supportsVision: false, priority: 1 },
  // Kimi: text-only
  { providerId: "kimi", modelGlob: "*", supportsVision: false, priority: 1 },
  // Qwen (non-VL): text-only. Qwen-VL is separate.
  { providerId: "qwen", modelGlob: "qwen*-vl*", supportsVision: true, priority: 0 }, // VL = vision
  { providerId: "qwen", modelGlob: "*", supportsVision: false, priority: 1 }, // non-VL = text-only

  // ── Cursor / opencode (pi running inside Cursor via cursor-sdk) ──
  // When pi bridges Cursor's model, provider is typically "opencode-go" or "opencode".
  // Cursor Composer models (composer-2.5-*) all use Claude/GPT underneath → vision.
  { providerId: "cursor", modelGlob: "*", supportsVision: true, priority: 0 },
  { providerId: "opencode", modelGlob: "*", supportsVision: true, priority: 0 },
  { providerId: "opencode-go", modelGlob: "*", supportsVision: true, priority: 0 },
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

  // GLM series (belt-and-suspenders with provider heuristic above)
  { modelId: "glm-5.1", providerId: "zhipuai", supportsVision: false, source: "bundled" },
  { modelId: "glm-5.2", providerId: "zhipuai", supportsVision: false, source: "bundled" },
  // Also match via "glm" alias (before user-prompt alias fix)
  { modelId: "glm-5.1", providerId: "glm", supportsVision: false, source: "bundled" },
  { modelId: "glm-5.2", providerId: "glm", supportsVision: false, source: "bundled" },
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
