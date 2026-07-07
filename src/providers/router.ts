import { CacheStore, CachedVisionProvider } from "../capabilities/cache.js";
import { CostTracker, CostTrackingVisionProvider } from "../capabilities/cost-tracker.js";
import { type AtlasConfig, type VisionProviderName, validateProviderConfig } from "../config.js";
import { ClaudeProvider } from "./claude.js";
import { ProviderError } from "./errors.js";
import { FallbackVisionProvider } from "./fallback.js";
import { GeminiProvider } from "./gemini.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import { OpenAIResponsesProvider } from "./openai-responses.js";
import type { FetchFn, VisionProvider } from "./types.js";

export interface CreateVisionProviderOptions {
  fetch?: FetchFn;
}

let sharedCacheStore: CacheStore | null = null;
let sharedCostTracker: CostTracker | null = null;

function getCacheStore(config: AtlasConfig): CacheStore {
  if (!sharedCacheStore) {
    sharedCacheStore = new CacheStore({
      ttlHours: config.cache.ttlHours,
      maxEntries: config.cache.maxEntries,
      maxSizeMb: config.cache.maxSizeMb,
    });
  }
  return sharedCacheStore;
}

function getCostTracker(config: AtlasConfig): CostTracker {
  if (!sharedCostTracker) {
    sharedCostTracker = new CostTracker({
      disabled: !config.atlas.trackCosts,
    });
  }
  return sharedCostTracker;
}

/**
 * Shared provider factory — single switch statement used by both
 * createVisionProvider (primary) and createInnerProvider (fallback).
 */
function instantiateProvider(cfg: AtlasConfig["vision"], fetch?: FetchFn): VisionProvider {
  switch (cfg.provider) {
    case "openai-compatible":
      return new OpenAICompatibleProvider({ config: cfg, fetch });
    case "openai-responses":
      return new OpenAIResponsesProvider({ config: cfg, fetch });
    case "gemini":
      return new GeminiProvider({ config: cfg, fetch });
    case "claude":
      return new ClaudeProvider({ config: cfg, fetch });
    default: {
      const unknown: never = cfg.provider;
      throw new ProviderError(
        `Unsupported vision provider: ${unknown as string}`,
        "invalid_response",
      );
    }
  }
}

export function createVisionProvider(
  config: AtlasConfig,
  options: CreateVisionProviderOptions = {},
): VisionProvider {
  validateProviderConfig(config);

  let inner: VisionProvider = instantiateProvider(config.vision, options.fetch);

  // Layer 1: caching (unless disabled)
  if (!config.cache.disableCache) {
    const store = getCacheStore(config);
    inner = new CachedVisionProvider(inner, {
      store,
      model: config.vision.model,
    });
  }

  // Layer 2: cost tracking (unless disabled)
  if (config.atlas.trackCosts) {
    const tracker = getCostTracker(config);
    inner = new CostTrackingVisionProvider(inner, {
      tracker,
    });
  }

  // Layer 3: fallback (unless no fallback configured)
  if (config.vision.fallback) {
    const fallbackProvider = createInnerProvider(config.vision.fallback, options.fetch);
    inner = new FallbackVisionProvider(inner, fallbackProvider);
  }

  return inner;
}

function createInnerProvider(
  cfg: { provider: VisionProviderName; apiKey: string; baseUrl: string; model: string },
  fetch?: FetchFn,
): VisionProvider {
  return instantiateProvider(
    {
      ...cfg,
      temperature: 0.1,
      timeoutMs: 60_000,
      maxImageMb: 10,
      maxOutputTokens: 4_000,
      retryMax: 3,
      responsesThinking: "disabled",
      responsesEffort: "minimal",
      responsesStore: true,
    },
    fetch,
  );
}

/**
 * Reset shared singletons (for testing).
 */
export function resetSharedProviders(): void {
  sharedCacheStore = null;
  sharedCostTracker = null;
}
