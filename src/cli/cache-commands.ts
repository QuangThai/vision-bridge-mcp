import { CacheStore } from "../capabilities/cache.js";

export async function runCacheStatsCommand(): Promise<number> {
  const store = new CacheStore();
  const stats = await store.stats();

  console.log("Cache location:", store.directory);
  console.log("Total entries:", stats.totalEntries);
  console.log("Total size:", formatBytes(stats.totalSizeBytes));
  console.log("Oldest entry:", stats.oldestEntry ?? "N/A");

  return 0;
}

export async function runCacheClearCommand(): Promise<number> {
  const store = new CacheStore();
  const removed = await store.clear();
  console.log(`Cleared ${removed} cache entr${removed === 1 ? "y" : "ies"}.`);
  return 0;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
