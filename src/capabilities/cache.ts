import { createHash } from "node:crypto";
import {
  rename as fsRename,
  mkdir,
  readFile,
  readdir,
  stat,
  unlink,
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
}

export class CacheStore {
  private readonly dir: string;

  /** Public accessor for the cache directory path. */
  get directory(): string {
    return this.dir;
  }
  private readonly ttlHours: number;

  constructor(options: CacheStoreOptions = {}) {
    this.dir = options.dir ?? cacheDir();
    this.ttlHours = options.ttlHours ?? 24;
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
  }

  // ---- stats / cleanup -----------------------------------------------------

  async stats(): Promise<{
    totalEntries: number;
    totalSizeBytes: number;
    oldestEntry: string | null;
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
export class CachedVisionProvider implements VisionProvider {
  readonly name: string;

  private readonly inner: VisionProvider;
  private readonly store: CacheStore;
  private readonly model: string;
  private readonly disabled: boolean;

  constructor(inner: VisionProvider, options: CachedVisionProviderOptions) {
    this.inner = inner;
    this.name = `cached:${inner.name}`;
    this.store = options.store;
    this.model = options.model;
    this.disabled = options.disabled ?? false;
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
      return cached;
    }

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
      return cached;
    }

    const result = await this.inner.compareImages(input);
    await this.store.set(key, result).catch(() => {});
    return result;
  }

  async healthCheck(): Promise<import("../providers/types.js").ProviderHealth> {
    return this.inner.healthCheck();
  }
}
