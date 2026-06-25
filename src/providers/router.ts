import { CacheStore, CachedVisionProvider } from "../capabilities/cache.js";
import { CostTracker, CostTrackingVisionProvider } from "../capabilities/cost-tracker.js";
import { type AtlasConfig, validateProviderConfig } from "../config.js";
import { ProviderError } from "./errors.js";
import { GeminiProvider } from "./gemini.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import type { FetchFn, VisionProvider } from "./types.js";

export interface CreateVisionProviderOptions {
  fetch?: FetchFn;
}

let sharedCacheStore: CacheStore | null = null;
let sharedCostTracker: CostTracker | null = null;

function getCacheStore(config: AtlasConfig): CacheStore {
  if (!sharedCacheStore) {
    sharedCacheStore = new CacheStore({ ttlHours: config.cache.ttlHours });
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

export function createVisionProvider(
  config: AtlasConfig,
  options: CreateVisionProviderOptions = {},
): VisionProvider {
  validateProviderConfig(config);

  let inner: VisionProvider;

  switch (config.vision.provider) {
    case "openai-compatible":
      inner = new OpenAICompatibleProvider({
        config: config.vision,
        fetch: options.fetch,
      });
      break;
    case "gemini":
      inner = new GeminiProvider({
        config: config.vision,
        fetch: options.fetch,
      });
      break;
    default: {
      const unknownProvider: never = config.vision.provider;
      throw new ProviderError(
        `Unsupported vision provider: ${unknownProvider as string}`,
        "invalid_response",
      );
    }
  }

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

  return inner;
}

/**
 * Reset shared singletons (for testing).
 */
export function resetSharedProviders(): void {
  sharedCacheStore = null;
  sharedCostTracker = null;
}
