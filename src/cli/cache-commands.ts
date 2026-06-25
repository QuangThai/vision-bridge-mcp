import { CacheStore } from "../capabilities/cache.js";

export async function runCacheStatsCommand(args?: string[]): Promise<number> {
  const useJson = args?.includes("--json") ?? false;

  const store = new CacheStore();
  const stats = await store.stats();

  if (useJson) {
    const output = {
      directory: store.directory,
      total_entries: stats.totalEntries,
      max_entries: stats.maxEntries,
      total_size_bytes: stats.totalSizeBytes,
      max_size_bytes: stats.maxSizeBytes,
      oldest_entry: stats.oldestEntry,
    };
    console.log(JSON.stringify(output, null, 2));
    return 0;
  }

  console.log("Cache location:", store.directory);
  console.log("Total entries:", stats.totalEntries);
  console.log("Max entries:", stats.maxEntries > 0 ? String(stats.maxEntries) : "unlimited");
  console.log("Total size:", formatBytes(stats.totalSizeBytes));
  console.log("Max size:", stats.maxSizeBytes > 0 ? formatBytes(stats.maxSizeBytes) : "unlimited");
  if (stats.maxSizeBytes > 0) {
    console.log("Usage:", `${((stats.totalSizeBytes / stats.maxSizeBytes) * 100).toFixed(1)}%`);
  }
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
