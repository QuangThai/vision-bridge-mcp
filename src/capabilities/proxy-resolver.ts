import { lookupBundledCapability } from "./bundled-registry.js";
import { type ModelsDevLookupInput, parseModelRef } from "./models-dev.js";
import type { ProviderVisionPattern } from "./types.js";

/** Proxy providers route to arbitrary upstream models — capabilities follow the upstream. */
export const PROXY_PROVIDER_IDS = new Set(["cursor", "opencode", "opencode-go"]);

/** Normalize legacy or alias provider ids to bundled-registry ids. */
export const PROVIDER_ALIASES: Record<string, string> = {
  zhipuai: "zai",
  glm: "zai",
  "z.ai": "zai",
};

/**
 * Known vision-native models exposed through proxy providers (e.g. Cursor Composer).
 * These are NOT in models.dev — apply before upstream inference.
 */
export const PROXY_MODEL_VISION_PATTERNS: ProviderVisionPattern[] = [
  { providerId: "cursor", modelGlob: "composer*", supportsVision: true, priority: 10 },
  { providerId: "cursor", modelGlob: "auto*", supportsVision: true, priority: 10 },
  { providerId: "opencode", modelGlob: "composer*", supportsVision: true, priority: 10 },
  { providerId: "opencode-go", modelGlob: "composer*", supportsVision: true, priority: 10 },
];

export type CapabilityResolutionSource =
  | "main-model-ref"
  | "underlying-model-env"
  | "proxy-pattern"
  | "upstream-inference"
  | "direct";

export interface ResolveCapabilityLookupResult {
  lookup: ModelsDevLookupInput;
  /** Original ref when resolved to a different upstream lookup. */
  resolvedFrom?: string;
  resolutionSource: CapabilityResolutionSource;
  /** Set when PROXY_MODEL_VISION_PATTERNS matched — skip further lookup. */
  proxySupportsVision?: boolean;
}

export interface ResolveCapabilityLookupInput {
  mainModelRef: string;
  providerId?: string;
  env?: NodeJS.ProcessEnv;
}

function globMatch(pattern: string, value: string): boolean {
  if (pattern === "*") return true;
  const regex = new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")}$`,
    "i",
  );
  return regex.test(value);
}

export function normalizeProviderId(providerId: string): string {
  const lower = providerId.trim().toLowerCase();
  return PROVIDER_ALIASES[lower] ?? lower;
}

export function isProxyProvider(providerId: string): boolean {
  return PROXY_PROVIDER_IDS.has(normalizeProviderId(providerId));
}

function findProxyModelPattern(providerId: string, modelId: string): ProviderVisionPattern | null {
  const normProvider = normalizeProviderId(providerId);
  const normModel = modelId.trim().toLowerCase();

  let best: ProviderVisionPattern | null = null;
  for (const pattern of PROXY_MODEL_VISION_PATTERNS) {
    if (pattern.providerId.toLowerCase() !== normProvider) continue;
    if (!globMatch(pattern.modelGlob, normModel)) continue;
    if (!best || pattern.priority < best.priority) {
      best = pattern;
    }
  }
  return best;
}

/**
 * Infer the real upstream provider from a bare model id when routed through a proxy.
 * Returns undefined when the upstream provider is ambiguous.
 */
export function inferUpstreamProviderFromModelId(modelId: string): string | undefined {
  const lower = modelId.trim().toLowerCase();

  if (lower.startsWith("composer") || lower.startsWith("auto")) {
    return "cursor";
  }
  if (
    lower.startsWith("gpt-") ||
    lower.startsWith("o1") ||
    lower.startsWith("o3") ||
    lower.startsWith("o4") ||
    lower.startsWith("chatgpt-")
  ) {
    return "openai";
  }
  if (
    lower.startsWith("claude") ||
    lower.includes("opus") ||
    lower.includes("sonnet") ||
    lower.includes("haiku")
  ) {
    return "anthropic";
  }
  if (lower.startsWith("gemini")) {
    return "google";
  }
  if (lower.startsWith("deepseek")) {
    return "deepseek";
  }
  if (lower.startsWith("glm")) {
    return "zai";
  }
  if (lower.startsWith("kimi")) {
    return "kimi";
  }
  if (lower.startsWith("qwen")) {
    return "qwen";
  }

  return undefined;
}

/**
 * Resolve the effective provider/model pair used for capability lookup.
 *
 * Priority for proxy refs:
 *   1. Known proxy-native patterns (composer*, auto*) — authoritative for vision routing
 *   2. MAIN_MODEL_REF (when different from hook ref, for unknown proxy models)
 *   3. CURSOR_UNDERLYING_MODEL / ATLAS_UNDERLYING_MODEL
 *   4. Upstream provider inferred from model id prefix
 *   5. Direct proxy ref (falls through to unknown → safe intercept)
 */
export function resolveCapabilityLookup(
  input: ResolveCapabilityLookupInput,
): ResolveCapabilityLookupResult {
  const parsed = parseModelRef(input.mainModelRef, input.providerId);
  const normalizedProvider = normalizeProviderId(parsed.providerId);
  const directLookup: ModelsDevLookupInput = {
    providerId: normalizedProvider,
    modelId: parsed.modelId,
  };

  if (!isProxyProvider(normalizedProvider)) {
    return { lookup: directLookup, resolutionSource: "direct" };
  }

  const env = input.env ?? process.env;
  const trimmedRef = input.mainModelRef.trim();

  const proxyPattern = findProxyModelPattern(normalizedProvider, parsed.modelId);
  if (proxyPattern) {
    return {
      lookup: directLookup,
      resolutionSource: "proxy-pattern",
      proxySupportsVision: proxyPattern.supportsVision,
    };
  }

  const mainModelRef = env.MAIN_MODEL_REF?.trim();
  if (mainModelRef && mainModelRef !== trimmedRef) {
    const upstream = parseModelRef(mainModelRef, input.providerId);
    return {
      lookup: {
        providerId: normalizeProviderId(upstream.providerId),
        modelId: upstream.modelId,
      },
      resolvedFrom: trimmedRef,
      resolutionSource: "main-model-ref",
    };
  }

  const underlying = env.CURSOR_UNDERLYING_MODEL?.trim() || env.ATLAS_UNDERLYING_MODEL?.trim();
  if (underlying) {
    const upstream = parseModelRef(underlying, input.providerId);
    return {
      lookup: {
        providerId: normalizeProviderId(upstream.providerId),
        modelId: upstream.modelId,
      },
      resolvedFrom: trimmedRef,
      resolutionSource: "underlying-model-env",
    };
  }

  const inferredProvider = inferUpstreamProviderFromModelId(parsed.modelId);
  if (inferredProvider && inferredProvider !== normalizedProvider) {
    const bundled = lookupBundledCapability(inferredProvider, parsed.modelId);
    if (bundled || inferredProvider !== "cursor") {
      return {
        lookup: {
          providerId: normalizeProviderId(inferredProvider),
          modelId: parsed.modelId,
        },
        resolvedFrom: trimmedRef,
        resolutionSource: "upstream-inference",
      };
    }
  }

  return { lookup: directLookup, resolutionSource: "direct" };
}
