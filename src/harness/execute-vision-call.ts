import type { PlannedVisionCall } from "../capabilities/types.js";
import type { AtlasConfig } from "../config.js";
import {
  analyzeImageDetailLevelSchema,
  analyzeImageModeSchema,
  compareImagesFocusSchema,
  compareImagesSeverityThresholdSchema,
  uiScreenshotGoalSchema,
  uiStyleSystemSchema,
  uiTargetFrameworkSchema,
} from "../extraction/schemas.js";
import type { FetchFn } from "../providers/types.js";
import { analyzeImage } from "../tools/analyze-image.js";
import { analyzeUiScreenshot } from "../tools/analyze-ui-screenshot.js";
import { compareImages } from "../tools/compare-images.js";
import { ocrImage } from "../tools/ocr-image.js";

export interface ExecuteVisionCallDependencies {
  config: AtlasConfig;
  cwd?: string;
  fetch?: FetchFn;
}

export interface ExecuteVisionCallResult {
  tool: PlannedVisionCall["tool"];
  imagePath: string;
  markdown: string;
}

function readStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function readBooleanArg(args: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = args[key];
  return typeof value === "boolean" ? value : fallback;
}

export async function executeVisionCall(
  call: PlannedVisionCall,
  dependencies: ExecuteVisionCallDependencies,
): Promise<ExecuteVisionCallResult> {
  const { config, cwd, fetch } = dependencies;

  if (call.tool === "analyze_image") {
    const mode = analyzeImageModeSchema.parse(readStringArg(call.args, "mode") ?? "general");
    const detailLevel = analyzeImageDetailLevelSchema.parse(
      readStringArg(call.args, "detail_level") ?? "standard",
    );
    const result = await analyzeImage(
      {
        image_path: call.imagePath,
        prompt: readStringArg(call.args, "prompt"),
        mode,
        detail_level: detailLevel,
        output_format: "markdown_json",
      },
      { config, cwd, fetch },
    );
    return { tool: call.tool, imagePath: call.imagePath, markdown: result.markdown };
  }

  if (call.tool === "ocr_image") {
    const result = await ocrImage(
      {
        image_path: call.imagePath,
        preserve_layout: readBooleanArg(call.args, "preserve_layout", true),
        extract_tables: readBooleanArg(call.args, "extract_tables", false),
        extract_code: readBooleanArg(call.args, "extract_code", false),
      },
      { config, cwd, fetch },
    );
    return { tool: call.tool, imagePath: call.imagePath, markdown: result.markdown };
  }

  if (call.tool === "analyze_ui_screenshot") {
    const result = await analyzeUiScreenshot(
      {
        image_path: call.imagePath,
        target_framework: uiTargetFrameworkSchema.parse(
          readStringArg(call.args, "target_framework") ?? "unknown",
        ),
        style_system: uiStyleSystemSchema.parse(
          readStringArg(call.args, "style_system") ?? "unknown",
        ),
        goal: uiScreenshotGoalSchema.parse(readStringArg(call.args, "goal") ?? "describe"),
      },
      { config, cwd, fetch },
    );
    return { tool: call.tool, imagePath: call.imagePath, markdown: result.markdown };
  }

  const beforePath = readStringArg(call.args, "before_path") ?? call.imagePath;
  const afterPath = readStringArg(call.args, "after_path");
  if (!afterPath) {
    throw new Error(
      `compare_images requires after_path in planned call args for ${call.imagePath}`,
    );
  }

  const result = await compareImages(
    {
      before_path: beforePath,
      after_path: afterPath,
      focus: compareImagesFocusSchema.parse(readStringArg(call.args, "focus") ?? "general"),
      severity_threshold: compareImagesSeverityThresholdSchema.parse(
        readStringArg(call.args, "severity_threshold") ?? "low",
      ),
    },
    { config, cwd, fetch },
  );

  return {
    tool: call.tool,
    imagePath: call.imagePath,
    markdown: result.markdown,
  };
}
