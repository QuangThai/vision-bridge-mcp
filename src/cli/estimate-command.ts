import { readFile } from "node:fs/promises";
import { autoDetectDetailLevel, readImageMetadata } from "../image/preprocess.js";

// ---------------------------------------------------------------------------
// Token cost estimation per detail level
// ---------------------------------------------------------------------------

/**
 * Estimate image token cost for OpenAI-compatible vision API.
 *
 * OpenAI formula:
 * - low:     85 tokens total
 * - high:    170 base + 170 * tiles, where tiles = ceil(w/512) * ceil(h/512)
 * - original: 170 base + 170 * tiles (same as high, but no resize first)
 */
function estimateTokens(width: number, height: number, detailLevel: string): number {
  switch (detailLevel) {
    case "low":
      return 85;
    case "medium": {
      // Pre-resize to 1024px on the shortest side, then tile at 512px
      const shortSide = Math.min(width, height);
      const scale = 1024 / Math.max(shortSide, 1);
      const scaledW = Math.ceil(width * scale);
      const scaledH = Math.ceil(height * scale);
      const tiles = Math.ceil(scaledW / 512) * Math.ceil(scaledH / 512);
      return 170 + 170 * tiles;
    }
    case "high":
    case "original": {
      const tiles = Math.ceil(width / 512) * Math.ceil(height / 512);
      return 170 + 170 * tiles;
    }
    default:
      return 85;
  }
}

// ---------------------------------------------------------------------------
// Pricing data (subset from cost-tracker for display)
// ---------------------------------------------------------------------------

interface ModelPricing {
  input: number; // per 1M tokens
  output: number; // per 1M tokens
}

const ESTIMATE_PRICING: Record<string, ModelPricing> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "claude-opus-4": { input: 15.0, output: 75.0 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "deepseek-v4-flash": { input: 0.15, output: 0.6 },
  "deepseek-chat": { input: 0.27, output: 1.1 },
};

function formatCost(costUsd: number): string {
  if (costUsd < 0.0001) return "< $0.0001";
  if (costUsd < 0.01) return `~ $${costUsd.toFixed(4)}`;
  return `~ $${costUsd.toFixed(2)}`;
}

function estimateCallCost(
  promptTokens: number,
  completionTokens: number,
  model: string,
): string {
  const pricing = ESTIMATE_PRICING[model] ?? { input: 0.15, output: 0.6 };
  const cost =
    (promptTokens * pricing.input + completionTokens * pricing.output) / 1_000_000;
  return formatCost(cost);
}

// ---------------------------------------------------------------------------
// CLI command
// ---------------------------------------------------------------------------

interface EstimateResult {
  filePath: string;
  width: number;
  height: number;
  fileSizeBytes: number;
  detectedDetail: "low" | "medium" | "high";
  tokensPerLevel: Record<string, number>;
  estimatedCostForModel: Record<string, string>;
}

export async function estimateCost(imagePath: string): Promise<EstimateResult> {
  const buffer = await readFile(imagePath);
  const metadata = await readImageMetadata(buffer, imagePath);
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const fileSizeBytes = buffer.length;

  const detectedDetail = await autoDetectDetailLevel(buffer, imagePath);

  const tokensPerLevel: Record<string, number> = {};
  for (const level of ["low", "medium", "high"]) {
    tokensPerLevel[level] = estimateTokens(width, height, level);
  }

  const estimatedCostForModel: Record<string, string> = {};
  for (const model of Object.keys(ESTIMATE_PRICING)) {
    const promptTokens = tokensPerLevel[detectedDetail] ?? 85;
    estimatedCostForModel[model] = estimateCallCost(
      promptTokens,
      200, // rough average completion
      model,
    );
  }

  return {
    filePath: imagePath,
    width,
    height,
    fileSizeBytes,
    detectedDetail,
    tokensPerLevel,
    estimatedCostForModel,
  };
}

export async function runEstimateCommand(args: string[]): Promise<number> {
  if (args.length === 0) {
    console.error("Usage: atlas-vision estimate <image-path>");
    console.error("Estimate vision API cost for an image.");
    return 1;
  }

  const imagePath = args[0];

  try {
    const result = await estimateCost(imagePath);

    console.log("=== Cost Estimate ===");
    console.log("File:", result.filePath);
    console.log("Dimensions:", `${result.width}x${result.height}`);
    console.log("File size:", formatFileSize(result.fileSizeBytes));
    console.log("Auto-detected detail:", result.detectedDetail);
    console.log("");
    console.log("Token cost by detail level:");
    for (const [level, tokens] of Object.entries(result.tokensPerLevel)) {
      const marker = level === result.detectedDetail ? " ← auto-detected" : "";
      console.log(`  ${level.padEnd(10)} ${tokens} tokens${marker}`);
    }
    console.log("");
    console.log("Estimated cost per call (image + ~200 completion tokens):");
    for (const [model, cost] of Object.entries(result.estimatedCostForModel)) {
      console.log(`  ${model.padEnd(30)} ${cost}`);
    }
    console.log("");
    console.log("Tip: ATLAS_ADAPTIVE_DETAIL auto-selects:", result.detectedDetail);
    console.log("     low    (85 tokens)    → simple UI with large elements");
    console.log("     medium (~500-1700 tkns) → coding screenshots with text ✓");
    console.log("     high   (~500-4000+ tkns) → photos, complex diagrams");
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    return 1;
  }

  return 0;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
