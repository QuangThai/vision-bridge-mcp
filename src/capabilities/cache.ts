import { createHash } from "node:crypto";
import {
  rename as fsRename,
  mkdir,
  readFile,
  readdir,
  stat,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { RawVisionResult, VisionProvider } from "../providers/types.js";

// ---------------------------------------------------------------------------
// Cache directory resolution
// ---------------------------------------------------------------------------

function cacheDir(): string {
  // Respect XDG_CACHE_HOME on Linux/Mac, fallback to LOCALAPPDATA on Windows
  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg) return resolve(xdg, "atlas-vision");
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) return resolve(localAppData, "atlas-vision", "cache");
  return resolve(homedir(), ".cache", "atlas-vision");
}

// ---------------------------------------------------------------------------
// Cache entry shape
// ---------------------------------------------------------------------------

export interface CacheEntry {
  /** SHA256 hex of the composite key (image+model+prompt+detail) */
  key: string;
  /** ISO-8601 timestamp when the entry was created */
  cachedAt: string;
  /** TTL in hours (default 24) */
  ttlHours: number;
  /** The cached provider result */
  result: RawVisionResult;
}

// ---------------------------------------------------------------------------
// CacheStore
// ---------------------------------------------------------------------------

export interface CacheStoreOptions {
  /** Override cache root directory (for testing) */
  dir?: string;
  /** TTL in hours (default 24) */
  ttlHours?: number;
  /** Max cache entries before LRU eviction (0 = unlimited, default 500). */
  maxEntries?: number;
  /** Max cache size in MB before LRU eviction (0 = unlimited, default 100). */
  maxSizeMb?: number;
}

export class CacheStore {
  private readonly dir: string;

  /** Public accessor for the cache directory path. */
  get directory(): string {
    return this.dir;
  }
  private readonly ttlHours: number;
  private readonly maxEntries: number;
  private readonly maxSizeBytes: number;

  constructor(options: CacheStoreOptions = {}) {
    this.dir = options.dir ?? cacheDir();
    this.ttlHours = options.ttlHours ?? 24;
    this.maxEntries = options.maxEntries ?? 500;
    this.maxSizeBytes = (options.maxSizeMb ?? 100) * 1024 * 1024;
  }

  // ---- LRU eviction -------------------------------------------------------

  /**
   * Touch a cache entry's mtime to mark it as recently used.
   */
  private async _touchFile(filePath: string): Promise<void> {
    const now = new Date();
    try {
      await utimes(filePath, now, now);
    } catch {
      // non-fatal — mtime may not be writable on all filesystems
    }
  }

  /**
   * Evict the oldest entries until both maxEntries and maxSizeBytes limits
   * are satisfied. Uses file mtime (last access) as the LRU signal.
   */
  private async _evictIfNeeded(): Promise<void> {
    if (this.maxEntries <= 0 && this.maxSizeBytes <= 0) return;

    const files: { name: string; size: number; mtime: Date }[] = [];
    try {
      const entries = await readdir(this.dir).catch(() => [] as string[]);
      for (const name of entries) {
        if (!name.endsWith(".json")) continue;
        const filePath = join(this.dir, name);
        try {
          const s = await stat(filePath);
          files.push({ name, size: s.size, mtime: s.mtime ?? new Date(0) });
        } catch {
          // skip inaccessible
        }
      }
    } catch {
      return;
    }

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    const totalCount = files.length;

    // Check if we're over any limit
    if (
      this.maxEntries > 0 &&
      totalCount <= this.maxEntries &&
      this.maxSizeBytes > 0 &&
      totalSize <= this.maxSizeBytes
    ) {
      return;
    }
    if (this.maxEntries <= 0 && (this.maxSizeBytes <= 0 || totalSize <= this.maxSizeBytes)) {
      return;
    }

    // Sort by mtime ascending (oldest first)
    files.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

    let sizeToFree = 0;
    let countToFree = 0;
    const targetEntries = this.maxEntries > 0 ? this.maxEntries : totalCount;
    const targetSize = this.maxSizeBytes > 0 ? this.maxSizeBytes : totalSize;

    if (totalCount > targetEntries) {
      countToFree = totalCount - targetEntries;
    }
    if (totalSize > targetSize) {
      sizeToFree = totalSize - targetSize;
    }

    const toFree = Math.max(
      countToFree,
      Math.ceil(sizeToFree / (totalSize / Math.max(totalCount, 1))),
    );

    // Keep a margin — delete oldest 10% + extra if still over
    const deleteCount = Math.min(
      files.length,
      Math.max(toFree + Math.max(1, Math.floor(files.length * 0.1)), countToFree),
    );

    for (let i = 0; i < deleteCount; i++) {
      try {
        await unlink(join(this.dir, files[i].name));
      } catch {
        // skip
      }
    }
  }

  // ---- key helpers ---------------------------------------------------------

  /**
   * Build a deterministic cache key from the vision request parameters.
   */
  buildKey(imageBase64: string, model: string, prompt: string, detailLevel?: string): string {
    const hash = createHash("sha256");
    hash.update(imageBase64);
    hash.update("\0");
    hash.update(model);
    hash.update("\0");
    hash.update(prompt);
    if (detailLevel) {
      hash.update("\0");
      hash.update(detailLevel);
    }
    return hash.digest("hex");
  }

  // ---- read / write --------------------------------------------------------

  async get(key: string): Promise<RawVisionResult | null> {
    const filePath = join(this.dir, `${key}.json`);
    try {
      const raw = await readFile(filePath, "utf-8");
      const entry: CacheEntry = JSON.parse(raw);

      // TTL check
      const ageMs = Date.now() - new Date(entry.cachedAt).getTime();
      if (ageMs > entry.ttlHours * 3_600_000) {
        // expired → delete and return null
        await unlink(filePath).catch(() => {});
        return null;
      }

      // Touch mtime for LRU tracking
      await this._touchFile(filePath);

      return entry.result;
    } catch {
      return null;
    }
  }

  async set(key: string, result: RawVisionResult): Promise<void> {
    await mkdir(this.dir, { recursive: true });

    const entry: CacheEntry = {
      key,
      cachedAt: new Date().toISOString(),
      ttlHours: this.ttlHours,
      result,
    };

    // Atomic write: temp file → rename
    const filePath = join(this.dir, `${key}.json`);
    const tmpPath = `${filePath}.tmp`;
    await writeFile(tmpPath, JSON.stringify(entry), "utf-8");
    try {
      await fsRename(tmpPath, filePath);
    } catch {
      // fallback: direct write if rename fails (cross-device edge case)
      await writeFile(filePath, JSON.stringify(entry), "utf-8");
    }

    // Evict LRU entries if over limit
    await this._evictIfNeeded().catch(() => {});
  }

  // ---- stats / cleanup -----------------------------------------------------

  async stats(): Promise<{
    totalEntries: number;
    totalSizeBytes: number;
    oldestEntry: string | null;
    maxEntries: number;
    maxSizeBytes: number;
  }> {
    let totalEntries = 0;
    let totalSizeBytes = 0;
    let oldest: Date | null = null;

    try {
      const files = await readdir(this.dir).catch(() => []);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const filePath = join(this.dir, file);
        try {
          const s = await stat(filePath);
          totalSizeBytes += s.size;
          totalEntries++;
          if (!oldest || s.mtime < oldest) oldest = s.mtime;
        } catch {
          // skip inaccessible
        }
      }
    } catch {
      // dir doesn't exist yet
    }

    return {
      totalEntries,
      totalSizeBytes,
      oldestEntry: oldest?.toISOString() ?? null,
      maxEntries: this.maxEntries,
      maxSizeBytes: this.maxSizeBytes,
    };
  }

  async clear(): Promise<number> {
    let removed = 0;
    try {
      const files = await readdir(this.dir).catch(() => []);
      for (const file of files) {
        if (!file.endsWith(".json") && !file.endsWith(".tmp")) continue;
        try {
          await unlink(join(this.dir, file));
          removed++;
        } catch {
          // skip
        }
      }
    } catch {
      // dir doesn't exist
    }
    return removed;
  }
}

// ---------------------------------------------------------------------------
// CachedVisionProvider — wraps any VisionProvider with a cache layer
// ---------------------------------------------------------------------------

export interface CachedVisionProviderOptions {
  store: CacheStore;
  model: string;
  disabled?: boolean;
}

/**
 * A caching proxy around a VisionProvider.
 *
 * For `analyzeImage` and `compareImages`, it computes a deterministic cache
 * key from the input image bytes, model id, prompt, and detail level.
 * On hit → return cached result; on miss → delegate to inner provider and store.
 *
 * `healthCheck` is never cached (always live).
 */
export interface CacheStats {
  hitCount: number;
  missCount: number;
}

/**
 * Rough average tokens saved per cache hit (low-detail image = 85 tokens).
 * Actual savings vary; this provides a minimum estimate.
 */
const ESTIMATED_TOKENS_PER_HIT = 85;

export class CachedVisionProvider implements VisionProvider {
  readonly name: string;

  private readonly inner: VisionProvider;
  private readonly store: CacheStore;
  private readonly model: string;
  private readonly disabled: boolean;
  private hitCount = 0;
  private missCount = 0;

  constructor(inner: VisionProvider, options: CachedVisionProviderOptions) {
    this.inner = inner;
    this.name = `cached:${inner.name}`;
    this.store = options.store;
    this.model = options.model;
    this.disabled = options.disabled ?? false;
  }

  /**
   * Return current cache hit/miss stats and estimated cost savings.
   */
  cacheStats(): CacheStats & {
    estimatedTokensSaved: number;
  } {
    return {
      hitCount: this.hitCount,
      missCount: this.missCount,
      estimatedTokensSaved: this.hitCount * ESTIMATED_TOKENS_PER_HIT,
    };
  }

  async analyzeImage(
    input: import("../providers/types.js").AnalyzeImageInput,
  ): Promise<RawVisionResult> {
    if (this.disabled) {
      return this.inner.analyzeImage(input);
    }

    const key = this.store.buildKey(
      input.image.base64,
      this.model,
      input.userPrompt,
      input.detailLevel,
    );

    const cached = await this.store.get(key);
    if (cached) {
      this.hitCount++;
      return { ...cached, _cached: true };
    }

    this.missCount++;
    const result = await this.inner.analyzeImage(input);
    await this.store.set(key, result).catch(() => {
      // cache write failure is non-fatal
    });
    return result;
  }

  async compareImages(
    input: import("../providers/types.js").CompareImagesInput,
  ): Promise<RawVisionResult> {
    if (this.disabled) {
      return this.inner.compareImages(input);
    }

    // Build key from combination of both images + prompt + model + detail
    const combinedBase64 = `${input.before.base64}\0${input.after.base64}`;
    const key = this.store.buildKey(
      combinedBase64,
      this.model,
      input.userPrompt,
      input.detailLevel,
    );

    const cached = await this.store.get(key);
    if (cached) {
      this.hitCount++;
      return { ...cached, _cached: true };
    }

    this.missCount++;
    const result = await this.inner.compareImages(input);
    await this.store.set(key, result).catch(() => {});
    return result;
  }

  async healthCheck(): Promise<import("../providers/types.js").ProviderHealth> {
    return this.inner.healthCheck();
  }
}
