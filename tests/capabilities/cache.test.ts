import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CacheStore, CachedVisionProvider } from "../../src/capabilities/cache.js";
import type { RawVisionResult, VisionProvider } from "../../src/providers/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function testDir(): string {
  return join(tmpdir(), `atlas-cache-test-${Date.now()}`);
}

function makeResult(text: string): RawVisionResult {
  return {
    text,
    provider: "test",
    model: "test-model",
    raw: { mock: true },
  };
}

// ---------------------------------------------------------------------------
// CacheStore
// ---------------------------------------------------------------------------

describe("CacheStore", () => {
  let dir: string;
  let store: CacheStore;

  beforeEach(() => {
    dir = testDir();
    store = new CacheStore({ dir, ttlHours: 24 });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null for a missing key", async () => {
    const result = await store.get("nonexistent");
    expect(result).toBeNull();
  });

  it("stores and retrieves a value", async () => {
    const key = store.buildKey("base64-data", "model-x", "analyze this");
    const result = makeResult("test output");

    await store.set(key, result);
    const cached = await store.get(key);

    expect(cached).not.toBeNull();
    expect(cached?.text).toBe("test output");
    expect(cached?.provider).toBe("test");
    expect(cached?.model).toBe("test-model");
  });

  it("returns null after TTL expiry", async () => {
    const shortTtl = new CacheStore({ dir, ttlHours: 0 }); // 0 hours = expired
    const key = shortTtl.buildKey("data", "m", "prompt");

    await shortTtl.set(key, makeResult("expired data"));
    const cached = await shortTtl.get(key);
    expect(cached).toBeNull();
  });

  it("builds deterministic keys", () => {
    const a = store.buildKey("abc", "m1", "prompt");
    const b = store.buildKey("abc", "m1", "prompt");
    expect(a).toBe(b);
  });

  it("builds different keys for different inputs", () => {
    const a = store.buildKey("abc", "m1", "prompt");
    const b = store.buildKey("abc", "m1", "other");
    const c = store.buildKey("abc", "m2", "prompt");
    const d = store.buildKey("xyz", "m1", "prompt");
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });

  it("builds different keys for different detail levels", () => {
    const a = store.buildKey("abc", "m1", "prompt", "low");
    const b = store.buildKey("abc", "m1", "prompt", "high");
    expect(a).not.toBe(b);
  });

  it("stats returns zero for empty cache", async () => {
    const stats = await store.stats();
    expect(stats.totalEntries).toBe(0);
    expect(stats.totalSizeBytes).toBe(0);
  });

  it("stats reflects stored entries", async () => {
    await store.set(store.buildKey("a", "m", "p"), makeResult("data"));
    await store.set(store.buildKey("b", "m", "p"), makeResult("data2"));

    const stats = await store.stats();
    expect(stats.totalEntries).toBe(2);
    expect(stats.totalSizeBytes).toBeGreaterThan(0);
  });

  it("clear removes all entries", async () => {
    await store.set(store.buildKey("a", "m", "p"), makeResult("data"));
    await store.set(store.buildKey("b", "m", "p"), makeResult("data2"));

    const removed = await store.clear();
    expect(removed).toBe(2);

    const stats = await store.stats();
    expect(stats.totalEntries).toBe(0);
  });

  it("handles corrupt cache files gracefully", async () => {
    const key = "corrupt-key";
    const filePath = join(dir, `${key}.json`);
    await mkdir(dir, { recursive: true });
    await writeFile(filePath, "not-json", "utf-8");

    const result = await store.get(key);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CachedVisionProvider
// ---------------------------------------------------------------------------

describe("CachedVisionProvider", () => {
  let dir: string;
  let callCount: number;
  let inner: VisionProvider;
  let store: CacheStore;

  beforeEach(() => {
    dir = testDir();
    callCount = 0;
    inner = {
      name: "test-provider",
      analyzeImage: async () => {
        callCount++;
        return makeResult(`result-${callCount}`);
      },
      compareImages: async () => {
        callCount++;
        return makeResult(`compare-${callCount}`);
      },
      healthCheck: async () => ({
        ok: true,
        provider: "test",
        model: "test",
      }),
    };
    store = new CacheStore({ dir, ttlHours: 24 });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("delegates to inner on cache miss", async () => {
    const cached = new CachedVisionProvider(inner, { store, model: "m" });

    const result = await cached.analyzeImage({
      image: { mimeType: "image/png", base64: "abc" },
      userPrompt: "analyze",
    });

    expect(result.text).toBe("result-1");
    expect(callCount).toBe(1);
  });

  it("returns cached result on second call", async () => {
    const cached = new CachedVisionProvider(inner, { store, model: "m" });

    await cached.analyzeImage({
      image: { mimeType: "image/png", base64: "abc" },
      userPrompt: "analyze",
    });

    const result = await cached.analyzeImage({
      image: { mimeType: "image/png", base64: "abc" },
      userPrompt: "analyze",
    });

    expect(result.text).toBe("result-1"); // still first result
    expect(callCount).toBe(1); // inner only called once
  });

  it("does not cache when disabled", async () => {
    const cached = new CachedVisionProvider(inner, {
      store,
      model: "m",
      disabled: true,
    });

    await cached.analyzeImage({
      image: { mimeType: "image/png", base64: "abc" },
      userPrompt: "analyze",
    });

    await cached.analyzeImage({
      image: { mimeType: "image/png", base64: "abc" },
      userPrompt: "analyze",
    });

    expect(callCount).toBe(2); // every call hits inner
  });

  it("caches compareImages results", async () => {
    const cached = new CachedVisionProvider(inner, { store, model: "m" });

    await cached.compareImages({
      before: { mimeType: "image/png", base64: "before" },
      after: { mimeType: "image/png", base64: "after" },
      userPrompt: "compare",
    });

    const result = await cached.compareImages({
      before: { mimeType: "image/png", base64: "before" },
      after: { mimeType: "image/png", base64: "after" },
      userPrompt: "compare",
    });

    expect(result.text).toBe("compare-1");
    expect(callCount).toBe(1);
  });

  it("does not cache healthCheck", async () => {
    const cached = new CachedVisionProvider(inner, { store, model: "m" });

    await cached.healthCheck();
    await cached.healthCheck();

    expect(callCount).toBe(0); // healthCheck doesn't increment callCount
  });
});
