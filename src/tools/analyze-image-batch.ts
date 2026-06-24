import type { AtlasConfig } from "../config.js";
import {
  type AnalyzeImageBatchOutput,
  analyzeImageBatchInputSchema,
  analyzeImageBatchOutputSchema,
} from "../extraction/schemas.js";
import { readImageFromPath } from "../image/read-image.js";
import type { FetchFn, VisionProvider } from "../providers/types.js";
import { type AnalyzeImageDependencies, analyzeImage } from "./analyze-image.js";

export const ANALYZE_IMAGE_BATCH_TOOL_NAME = "analyze_image_batch";

export const ANALYZE_IMAGE_BATCH_TOOL_DESCRIPTION =
  "Analyze multiple images in a single call. Use this when a coding agent needs to process several screenshots, UI mockups, diagrams, or error captures at once — for example, comparing multiple error states, reviewing a multi-page UI flow, or batch-analyzing a series of charts. Each image is analyzed independently and results are returned as a combined report with per-image summaries.";

export interface AnalyzeImageBatchDependencies {
  config: AtlasConfig;
  cwd?: string;
  provider?: VisionProvider;
  fetch?: FetchFn;
  readImage?: typeof readImageFromPath;
}

function formatDurationMs(start: bigint): string {
  const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
  return `${elapsed.toFixed(0)}ms`;
}

export async function analyzeImageBatch(
  input: unknown,
  dependencies: AnalyzeImageBatchDependencies,
): Promise<{ markdown: string; structured: AnalyzeImageBatchOutput }> {
  const parsedInput = analyzeImageBatchInputSchema.parse(input);
  const start = process.hrtime.bigint();

  const items: AnalyzeImageBatchOutput["items"] = [];
  const errors: AnalyzeImageBatchOutput["errors"] = [];

  let lastProvider = "";
  let lastModel = "";

  for (let i = 0; i < parsedInput.images.length; i++) {
    const item = parsedInput.images[i];
    try {
      const analyzeDeps: AnalyzeImageDependencies = {
        config: dependencies.config,
        cwd: dependencies.cwd,
        provider: dependencies.provider,
        fetch: dependencies.fetch,
        readImage: dependencies.readImage,
      };

      const result = await analyzeImage(
        {
          image_path: item.image_path,
          prompt: item.prompt,
          mode: item.mode,
          detail_level: parsedInput.detail_level,
        },
        analyzeDeps,
      );

      lastProvider = result.structured.provider.name;
      lastModel = result.structured.provider.model;

      items.push({
        index: i,
        image_path: item.image_path,
        result: result.structured,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      errors.push({
        index: i,
        image_path: item.image_path,
        error: message,
      });
    }
  }

  const totalDuration = formatDurationMs(start);

  // Build summary markdown
  const lines: string[] = [
    "## Batch Analysis Summary",
    "",
    `**Images processed:** ${items.length}/${parsedInput.images.length}`,
    `**Failed:** ${errors.length}`,
    `**Duration:** ${totalDuration}`,
    "",
  ];

  if (errors.length > 0) {
    lines.push("### Failed images");
    for (const err of errors) {
      lines.push(`- ❌ [${err.index}] ${err.image_path}: ${err.error}`);
    }
    lines.push("");
  }

  for (const item of items) {
    const result = item.result;
    lines.push(`### [${item.index}] ${item.image_path}`);
    lines.push(`**Summary:** ${result.summary}`);
    lines.push(`**Observations:** ${result.observations.length}`);
    lines.push(`**Inferences:** ${result.inferences.length}`);
    if (result.uncertainties.length > 0) {
      lines.push(`**Uncertainties:** ${result.uncertainties.length}`);
    }
    if (result.mermaid) {
      lines.push("**Mermaid diagram:** ✓");
    }
    if (result.tables && result.tables.length > 0) {
      lines.push(`**Tables extracted:** ${result.tables.length}`);
    }
    lines.push("");
  }

  lines.push(`**Provider:** ${lastProvider} · **Model:** ${lastModel}`);
  lines.push(`**Duration:** ${totalDuration}`);

  const structured = analyzeImageBatchOutputSchema.parse({
    summary: `Batch analysis of ${items.length}/${parsedInput.images.length} images completed in ${totalDuration}.`,
    items,
    total_processed: items.length,
    failed_count: errors.length,
    errors,
    provider: {
      name: lastProvider,
      model: lastModel,
    },
  });

  return {
    markdown: lines.join("\n").trim(),
    structured,
  };
}
