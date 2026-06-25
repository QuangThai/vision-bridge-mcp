import { CostTracker } from "../capabilities/cost-tracker.js";

export async function runCostsCommand(args: string[]): Promise<number> {
  // Parse flags first so invalid args error out early
  const flagsResult = parseFlags(args);
  if (flagsResult instanceof Error) {
    console.error(flagsResult.message);
    return 1;
  }
  const flags = flagsResult;

  const tracker = new CostTracker();
  const entries = await tracker.readAll();

  if (entries.length === 0) {
    console.log("No cost records found.");
    console.log("Cost tracking is enabled by default (ATLAS_TRACK_COSTS=true).");
    return 0;
  }
  let filtered = entries;

  if (flags.today) {
    const today = new Date().toISOString().slice(0, 10);
    filtered = entries.filter((e) => e.timestamp.startsWith(today));
  }

  if (flags.session) {
    // Session = entries from the last hour
    const cutoff = Date.now() - 3_600_000;
    filtered = entries.filter((e) => new Date(e.timestamp).getTime() > cutoff);
  }

  if (flags.days !== undefined) {
    const cutoff = Date.now() - flags.days * 86_400_000;
    filtered = entries.filter((e) => new Date(e.timestamp).getTime() > cutoff);
  }

  // Compute summary
  const totalCalls = filtered.length;
  let totalCost = 0;
  let totalTokens = 0;
  const byModel: Record<string, { calls: number; cost: number; tokens: number }> = {};

  for (const entry of filtered) {
    totalCost += entry.estimatedCostUsd ?? 0;
    totalTokens += entry.totalTokens ?? 0;

    if (!byModel[entry.model]) {
      byModel[entry.model] = { calls: 0, cost: 0, tokens: 0 };
    }
    byModel[entry.model].calls++;
    byModel[entry.model].cost += entry.estimatedCostUsd ?? 0;
    byModel[entry.model].tokens += entry.totalTokens ?? 0;
  }

  // Print report
  const logSize = await tracker.logSizeBytes();
  console.log("─".repeat(50));
  console.log("  Atlas Vision Cost Report");
  console.log("─".repeat(50));
  console.log("");
  console.log(`  Period:         ${describePeriod(flags)}`);
  console.log(`  Total calls:    ${totalCalls}`);
  console.log(`  Total tokens:   ${totalTokens.toLocaleString()}`);
  console.log(`  Estimated cost: $${totalCost.toFixed(4)}`);
  console.log(`  Log file size:  ${formatBytes(logSize)}`);
  console.log("");

  if (Object.keys(byModel).length > 0) {
    console.log("  Breakdown by model:");
    for (const [model, stats] of Object.entries(byModel)) {
      console.log(
        `    ${model.padEnd(25)} ${stats.calls.toString().padStart(3)} calls  $${stats.cost.toFixed(4)}  ${stats.tokens.toLocaleString().padStart(8)} tokens`,
      );
    }
  }

  console.log("");
  console.log("  Note: Cost is estimated based on known pricing.");
  console.log("  Token counts come from the provider response (if included).");

  return 0;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function describePeriod(flags: CostFlags): string {
  if (flags.today) return "Today";
  if (flags.session) return "Last hour (session)";
  if (flags.days !== undefined) return `Last ${flags.days} day${flags.days === 1 ? "" : "s"}`;
  return "All time";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface CostFlags {
  today: boolean;
  session: boolean;
  days: number | undefined;
}

function parseFlags(args: string[]): CostFlags | Error {
  const flags: CostFlags = { today: false, session: false, days: undefined };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--today":
        flags.today = true;
        break;
      case "--session":
        flags.session = true;
        break;
      case "--range": {
        const val = args[++i];
        const parsed = val ? Number.parseInt(val, 10) : undefined;
        if (parsed !== undefined && (Number.isNaN(parsed) || parsed < 1)) {
          return new Error(`Invalid --range value: "${val}". Expected a positive integer.`);
        }
        flags.days = parsed;
        break;
      }
    }
  }

  return flags;
}
