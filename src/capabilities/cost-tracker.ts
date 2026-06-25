import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { RawVisionResult, VisionProvider } from "../providers/types.js";

// ---------------------------------------------------------------------------
// Data directory resolution
// ---------------------------------------------------------------------------

function dataDir(): string {
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) return resolve(xdg, "atlas-vision");
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) return resolve(localAppData, "atlas-vision", "data");
  return resolve(homedir(), ".local", "share", "atlas-vision");
}

// ---------------------------------------------------------------------------
// Cost entry
// ---------------------------------------------------------------------------

export interface CostEntry {
  timestamp: string;
  model: string;
  operation: "analyze_image" | "compare_images" | "ocr_image" | "analyze_ui_screenshot";
  imageCount: number;
  imageSizeBytes: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
}

// ---------------------------------------------------------------------------
// Pricing defaults (per 1M tokens)
// ---------------------------------------------------------------------------

const DEFAULT_INPUT_PRICE_PER_1M = 0.15; // gpt-4o-mini-like
const DEFAULT_OUTPUT_PRICE_PER_1M = 0.6;

const KNOWN_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-audio-preview": { input: 2.5, output: 10.0 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-4": { input: 30.0, output: 60.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "claude-sonnet-4": { input: 3.0, output: 15.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-opus-4": { input: 15.0, output: 75.0 },
  "claude-5-haiku": { input: 0.8, output: 4.0 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.0-pro": { input: 2.0, output: 8.0 },
  "gemini-1.5-pro": { input: 1.25, output: 5.0 },
  "deepseek-chat": { input: 0.27, output: 1.1 },
  "deepseek-v4-flash": { input: 0.15, output: 0.6 },
  "deepseek-v4-pro": { input: 0.3, output: 1.2 },
};

function estimateCost(
  model: string,
  promptTokens: number | undefined,
  completionTokens: number | undefined,
): number | undefined {
  if (promptTokens === undefined && completionTokens === undefined) return undefined;

  const pricing = KNOWN_PRICING[model] ?? {
    input: DEFAULT_INPUT_PRICE_PER_1M,
    output: DEFAULT_OUTPUT_PRICE_PER_1M,
  };

  const inputTokens = promptTokens ?? 0;
  const outputTokens = completionTokens ?? 0;

  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

// ---------------------------------------------------------------------------
// CostTracker
// ---------------------------------------------------------------------------

function isRawWithUsage(raw: unknown): raw is {
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
} {
  return typeof raw === "object" && raw !== null;
}

export interface CostTrackerOptions {
  /** Override data directory (for testing) */
  dir?: string;
  /** Whether tracking is enabled */
  disabled?: boolean;
}

export class CostTracker {
  private readonly dir: string;
  private readonly disabled: boolean;

  constructor(options: CostTrackerOptions = {}) {
    this.dir = options.dir ?? dataDir();
    this.disabled = options.disabled ?? false;
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  private logPath(): string {
    return join(this.dir, "costs.jsonl");
  }

  /**
   * Record a vision API call.
   */
  async record(params: {
    model: string;
    operation: CostEntry["operation"];
    imageCount: number;
    imageSizeBytes: number;
    result: RawVisionResult;
  }): Promise<void> {
    if (this.disabled) return;

    // Extract token usage from raw response
    let promptTokens: number | undefined;
    let completionTokens: number | undefined;
    if (isRawWithUsage(params.result.raw) && params.result.raw.usage) {
      promptTokens = params.result.raw.usage.prompt_tokens;
      completionTokens = params.result.raw.usage.completion_tokens;
    }

    const totalTokens =
      promptTokens !== undefined && completionTokens !== undefined
        ? promptTokens + completionTokens
        : undefined;

    const entry: CostEntry = {
      timestamp: new Date().toISOString(),
      model: params.model,
      operation: params.operation,
      imageCount: params.imageCount,
      imageSizeBytes: params.imageSizeBytes,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: estimateCost(params.model, promptTokens, completionTokens),
    };

    await this.ensureDir();
    await appendFile(this.logPath(), `${JSON.stringify(entry)}\n`, "utf-8");
  }

  /**
   * Read all cost entries.
   */
  async readAll(): Promise<CostEntry[]> {
    try {
      const content = await readFile(this.logPath(), "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      return lines.map((line) => JSON.parse(line) as CostEntry);
    } catch {
      return [];
    }
  }

  /**
   * Get aggregated summary.
   */
  async summary(): Promise<{
    totalCalls: number;
    totalEstimatedCostUsd: number;
    totalPromptTokens: number;
    totalCompletionTokens: number;
    byModel: Record<string, { calls: number; costUsd: number }>;
  }> {
    const entries = await this.readAll();

    let totalEstimatedCostUsd = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    const byModel: Record<string, { calls: number; costUsd: number }> = {};

    for (const entry of entries) {
      totalEstimatedCostUsd += entry.estimatedCostUsd ?? 0;
      totalPromptTokens += entry.promptTokens ?? 0;
      totalCompletionTokens += entry.completionTokens ?? 0;

      if (!byModel[entry.model]) {
        byModel[entry.model] = { calls: 0, costUsd: 0 };
      }
      byModel[entry.model].calls++;
      byModel[entry.model].costUsd += entry.estimatedCostUsd ?? 0;
    }

    return {
      totalCalls: entries.length,
      totalEstimatedCostUsd,
      totalPromptTokens,
      totalCompletionTokens,
      byModel,
    };
  }

  /**
   * Get the log file size.
   */
  async logSizeBytes(): Promise<number> {
    try {
      const s = await stat(this.logPath());
      return s.size;
    } catch {
      return 0;
    }
  }
}

// ---------------------------------------------------------------------------
// CostTrackingVisionProvider — wraps any VisionProvider to record costs
// ---------------------------------------------------------------------------

export interface CostTrackingVisionProviderOptions {
  tracker: CostTracker;
  disabled?: boolean;
}

/**
 * A wrapper around VisionProvider that records cost/token data for each call.
 */
export class CostTrackingVisionProvider implements VisionProvider {
  readonly name: string;

  private readonly inner: VisionProvider;
  private readonly tracker: CostTracker;
  private readonly disabled: boolean;

  constructor(inner: VisionProvider, options: CostTrackingVisionProviderOptions) {
    this.inner = inner;
    this.name = `tracked:${inner.name}`;
    this.tracker = options.tracker;
    this.disabled = options.disabled ?? false;
  }

  async analyzeImage(
    input: import("../providers/types.js").AnalyzeImageInput,
  ): Promise<RawVisionResult> {
    const result = await this.inner.analyzeImage(input);
    if (!this.disabled) {
      const imageSizeBytes = Math.ceil((input.image.base64.length * 3) / 4); // approximate
      await this.tracker
        .record({
          model: result.model,
          operation: "analyze_image",
          imageCount: 1,
          imageSizeBytes,
          result,
        })
        .catch(() => {});
    }
    return result;
  }

  async compareImages(
    input: import("../providers/types.js").CompareImagesInput,
  ): Promise<RawVisionResult> {
    const result = await this.inner.compareImages(input);
    if (!this.disabled) {
      const size1 = Math.ceil((input.before.base64.length * 3) / 4);
      const size2 = Math.ceil((input.after.base64.length * 3) / 4);
      await this.tracker
        .record({
          model: result.model,
          operation: "compare_images",
          imageCount: 2,
          imageSizeBytes: size1 + size2,
          result,
        })
        .catch(() => {});
    }
    return result;
  }

  async healthCheck(): Promise<import("../providers/types.js").ProviderHealth> {
    return this.inner.healthCheck();
  }
}
