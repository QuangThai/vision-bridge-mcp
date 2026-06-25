import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { FetchFn } from "../providers/types.js";
import { lookupBundledCapability } from "./bundled-registry.js";
import type {
  ModelCapabilities,
  ModelsDevCacheEntry,
  ModelsDevCatalog,
  ModelsDevModel,
  VisionCapabilityOverride,
} from "./types.js";

export const MODELS_DEV_DEFAULT_URL = "https://models.dev/api.json";
export const MODELS_DEV_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface ModelsDevClientOptions {
  catalogUrl?: string;
  cacheDir?: string;
  cacheTtlMs?: number;
  fetch?: FetchFn;
  overrides?: VisionCapabilityOverride[];
}

export interface ModelsDevLookupInput {
  providerId: string;
  modelId: string;
}

function defaultCacheDir(): string {
  return join(homedir(), ".cache", "atlas-vision-mcp");
}

function cacheFilePath(cacheDir: string): string {
  return join(cacheDir, "models-dev.json");
}

function normalizeProviderId(providerId: string): string {
  return providerId.trim().toLowerCase();
}

function normalizeModelId(modelId: string): string {
  return modelId.trim().toLowerCase();
}

function splitModelRef(modelRef: string): { providerId: string; modelId: string } | null {
  const trimmed = modelRef.trim();
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex <= 0 || slashIndex === trimmed.length - 1) {
    return null;
  }

  return {
    providerId: normalizeProviderId(trimmed.slice(0, slashIndex)),
    modelId: normalizeModelId(trimmed.slice(slashIndex + 1)),
  };
}

export function parseModelRef(modelRef: string, fallbackProviderId?: string): ModelsDevLookupInput {
  const split = splitModelRef(modelRef);
  if (split) {
    return split;
  }

  if (!fallbackProviderId?.trim()) {
    throw new Error(
      `Model ref "${modelRef}" must be provider/model or provide fallbackProviderId.`,
    );
  }

  return {
    providerId: normalizeProviderId(fallbackProviderId),
    modelId: normalizeModelId(modelRef),
  };
}

function modelSupportsVision(model: ModelsDevModel): boolean {
  const inputModalities = model.modalities?.input ?? [];
  return Boolean(model.attachment) || inputModalities.includes("image");
}

function toCapabilities(
  providerId: string,
  modelId: string,
  model: ModelsDevModel,
): ModelCapabilities {
  return {
    modelId,
    providerId,
    supportsVision: modelSupportsVision(model),
    supportsTools: Boolean(model.tool_call),
    supportsReasoning: Boolean(model.reasoning),
    inputModalities: model.modalities?.input ?? [],
    outputModalities: model.modalities?.output ?? [],
    contextWindow: model.limit?.context ?? 0,
    maxOutputTokens: model.limit?.output ?? 0,
    source: "models.dev",
  };
}

function findProviderModel(
  catalog: ModelsDevCatalog,
  providerId: string,
  modelId: string,
): ModelsDevModel | null {
  if (!catalog.providers) {
    return null;
  }

  const provider = catalog.providers[providerId];
  if (!provider) {
    return null;
  }

  const direct = provider.models[modelId];
  if (direct) {
    return direct;
  }

  for (const [key, model] of Object.entries(provider.models)) {
    if (key.toLowerCase() === modelId) {
      return model;
    }
    if (model.id?.toLowerCase() === modelId) {
      return model;
    }
  }

  return null;
}

function findOverride(
  overrides: VisionCapabilityOverride[],
  providerId: string,
  modelId: string,
): VisionCapabilityOverride | null {
  const normalizedProvider = normalizeProviderId(providerId);
  const normalizedModel = normalizeModelId(modelId);

  for (const override of overrides) {
    const overrideModel = normalizeModelId(override.modelId);
    if (overrideModel !== normalizedModel) {
      continue;
    }

    if (override.providerId && normalizeProviderId(override.providerId) !== normalizedProvider) {
      continue;
    }

    return override;
  }

  return null;
}

function applyOverride(
  base: ModelCapabilities | null,
  override: VisionCapabilityOverride,
  providerId: string,
  modelId: string,
): ModelCapabilities {
  return {
    modelId,
    providerId,
    supportsVision: override.supportsVision,
    supportsTools: base?.supportsTools ?? true,
    supportsReasoning: base?.supportsReasoning ?? false,
    inputModalities: override.supportsVision
      ? Array.from(new Set([...(base?.inputModalities ?? ["text"]), "image"]))
      : (base?.inputModalities ?? ["text"]),
    outputModalities: base?.outputModalities ?? ["text"],
    contextWindow: base?.contextWindow ?? 0,
    maxOutputTokens: base?.maxOutputTokens ?? 0,
    source: override.source ?? "override",
  };
}

async function readCache(cacheDir: string): Promise<ModelsDevCacheEntry | null> {
  try {
    const raw = await readFile(cacheFilePath(cacheDir), "utf8");
    return JSON.parse(raw) as ModelsDevCacheEntry;
  } catch {
    return null;
  }
}

async function writeCache(cacheDir: string, entry: ModelsDevCacheEntry): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(cacheFilePath(cacheDir), JSON.stringify(entry), "utf8");
}

function isFresh(entry: ModelsDevCacheEntry, ttlMs: number, now = Date.now()): boolean {
  const fetchedAt = Date.parse(entry.fetchedAt);
  if (Number.isNaN(fetchedAt)) {
    return false;
  }
  return now - fetchedAt < ttlMs;
}

export class ModelsDevClient {
  private readonly catalogUrl: string;
  private readonly cacheDir: string;
  private readonly cacheTtlMs: number;
  private readonly fetchFn: FetchFn;
  private readonly overrides: VisionCapabilityOverride[];
  /** Disk cache is off when a custom fetch is injected without an explicit cacheDir (tests/mocks). */
  private readonly diskCacheEnabled: boolean;
  private inFlight: Promise<ModelsDevCatalog> | null = null;
  private memoryCache: ModelsDevCacheEntry | null = null;

  constructor(options: ModelsDevClientOptions = {}) {
    this.catalogUrl = options.catalogUrl ?? MODELS_DEV_DEFAULT_URL;
    this.cacheDir = options.cacheDir ?? defaultCacheDir();
    this.cacheTtlMs = options.cacheTtlMs ?? MODELS_DEV_DEFAULT_TTL_MS;
    this.fetchFn = options.fetch ?? fetch;
    this.overrides = options.overrides ?? [];
    this.diskCacheEnabled = options.cacheDir !== undefined || options.fetch === undefined;
  }

  async getCatalog(forceRefresh = false): Promise<ModelsDevCatalog> {
    if (!forceRefresh && this.memoryCache && isFresh(this.memoryCache, this.cacheTtlMs)) {
      return this.memoryCache.catalog;
    }

    if (!forceRefresh && this.diskCacheEnabled) {
      const diskCache = await readCache(this.cacheDir);
      if (diskCache && isFresh(diskCache, this.cacheTtlMs)) {
        this.memoryCache = diskCache;
        return diskCache.catalog;
      }
    }

    if (!this.inFlight) {
      this.inFlight = this.fetchCatalog().finally(() => {
        this.inFlight = null;
      });
    }

    return this.inFlight;
  }

  private async fetchCatalog(): Promise<ModelsDevCatalog> {
    const headers: Record<string, string> = {};
    const diskCache = this.diskCacheEnabled ? await readCache(this.cacheDir) : null;
    if (diskCache?.etag) {
      headers["If-None-Match"] = diskCache.etag;
    }

    const response = await this.fetchFn(this.catalogUrl, { headers });

    if (response.status === 304 && diskCache) {
      this.memoryCache = diskCache;
      return diskCache.catalog;
    }

    if (!response.ok) {
      if (diskCache) {
        this.memoryCache = diskCache;
        return diskCache.catalog;
      }
      throw new Error(`models.dev request failed with status ${response.status}`);
    }

    const catalog = (await response.json()) as ModelsDevCatalog;
    const entry: ModelsDevCacheEntry = {
      fetchedAt: new Date().toISOString(),
      etag: response.headers.get("etag") ?? undefined,
      catalog,
    };

    this.memoryCache = entry;
    if (this.diskCacheEnabled) {
      await writeCache(this.cacheDir, entry);
    }
    return catalog;
  }

  async getModelCapabilities(input: ModelsDevLookupInput): Promise<ModelCapabilities> {
    const providerId = normalizeProviderId(input.providerId);
    const modelId = normalizeModelId(input.modelId);

    const override = findOverride(this.overrides, providerId, modelId);
    if (override) {
      const catalog = await this.getCatalog().catch(() => null);
      const model = catalog ? findProviderModel(catalog, providerId, modelId) : null;
      const base = model ? toCapabilities(providerId, modelId, model) : null;
      return applyOverride(base, override, providerId, modelId);
    }

    // Step 2: Bundled registry (heuristics + specific overrides)
    // Checked BEFORE models.dev because bundled contains CURATED exceptions
    // that must take priority (e.g. deepseek-v4-flash is text-only despite
    // what models.dev might claim in the future).
    const bundled = lookupBundledCapability(providerId, modelId);
    if (bundled) {
      // Still fetch catalog for metadata (context window, tokens, etc.)
      const catalog = await this.getCatalog().catch(() => null);
      const model = catalog ? findProviderModel(catalog, providerId, modelId) : null;
      const base = model ? toCapabilities(providerId, modelId, model) : null;
      return {
        modelId,
        providerId,
        supportsVision: bundled.supportsVision,
        supportsTools: base?.supportsTools ?? true,
        supportsReasoning: base?.supportsReasoning ?? false,
        inputModalities: bundled.supportsVision
          ? Array.from(new Set([...(base?.inputModalities ?? ["text"]), "image"]))
          : (base?.inputModalities ?? ["text"]),
        outputModalities: base?.outputModalities ?? ["text"],
        contextWindow: base?.contextWindow ?? 0,
        maxOutputTokens: base?.maxOutputTokens ?? 0,
        source: bundled.source,
      };
    }

    // Step 3: models.dev catalog (for models NOT in bundled registry)
    const catalog = await this.getCatalog();
    const model = findProviderModel(catalog, providerId, modelId);
    if (model) {
      return toCapabilities(providerId, modelId, model);
    }

    return {
      modelId,
      providerId,
      supportsVision: false,
      supportsTools: true,
      supportsReasoning: false,
      inputModalities: ["text"],
      outputModalities: ["text"],
      contextWindow: 0,
      maxOutputTokens: 0,
      source: "unknown",
    };
  }
}

let defaultClient: ModelsDevClient | null = null;

export function createModelsDevClient(options: ModelsDevClientOptions = {}): ModelsDevClient {
  return new ModelsDevClient(options);
}

export function getDefaultModelsDevClient(): ModelsDevClient {
  if (!defaultClient) {
    defaultClient = createModelsDevClient();
  }
  return defaultClient;
}

export async function getModelCapabilities(
  input: ModelsDevLookupInput,
  options: ModelsDevClientOptions = {},
): Promise<ModelCapabilities> {
  const client =
    options.catalogUrl || options.cacheDir || options.overrides || options.fetch
      ? createModelsDevClient(options)
      : getDefaultModelsDevClient();
  return client.getModelCapabilities(input);
}
