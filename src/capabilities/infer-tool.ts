import type { PlannedVisionCall, VisionToolName } from "./types.js";

const OCR_HINTS = [
  "ocr",
  "extract text",
  "read text",
  "terminal",
  "console",
  "log output",
  "error message",
  "stack trace",
  "stderr",
  "stdout",
];

const UI_HINTS = [
  "ui",
  "mockup",
  "screenshot",
  "layout",
  "component",
  "navbar",
  "sidebar",
  "button",
  "form",
  "accessibility",
  "a11y",
  "figma",
  "design",
];

const COMPARE_HINTS = ["compare", "before", "after", "diff", "regression", "visual diff"];

function includesHint(text: string, hints: string[]): boolean {
  const lower = text.toLowerCase();
  return hints.some((hint) => lower.includes(hint));
}

export function inferVisionTool(
  messageText: string,
  imagePath: string,
): { tool: VisionToolName; reason: string; args: Record<string, unknown> } {
  const context = `${messageText}\n${imagePath}`;

  if (includesHint(context, COMPARE_HINTS)) {
    return {
      tool: "compare_images",
      reason: "Message mentions before/after or visual comparison.",
      args: {
        focus: "general",
        severity_threshold: "low",
      },
    };
  }

  if (includesHint(context, OCR_HINTS)) {
    return {
      tool: "ocr_image",
      reason: "Message looks text-heavy (terminal, OCR, or error extraction).",
      args: {
        preserve_layout: true,
        extract_tables: includesHint(context, ["table", "csv"]),
        extract_code: includesHint(context, ["code", "stack", "trace"]),
      },
    };
  }

  if (includesHint(context, UI_HINTS)) {
    return {
      tool: "analyze_ui_screenshot",
      reason: "Message references UI, layout, or screenshot review.",
      args: {
        target_framework: "unknown",
        style_system: "unknown",
        goal: includesHint(context, ["accessibility", "a11y"])
          ? "accessibility_review"
          : includesHint(context, ["implement", "build", "code"])
            ? "implement"
            : includesHint(context, ["debug", "bug", "broken"])
              ? "debug"
              : "describe",
      },
    };
  }

  return {
    tool: "analyze_image",
    reason: "Default general image analysis.",
    args: {
      mode: includesHint(context, ["diagram", "flowchart", "architecture"])
        ? "diagram"
        : includesHint(context, ["chart", "graph", "plot"])
          ? "chart"
          : includesHint(context, ["error", "exception", "stack"])
            ? "error_screenshot"
            : "general",
      detail_level: "standard",
      output_format: "markdown_json",
    },
  };
}

export function planVisionCalls(messageText: string, imagePaths: string[]): PlannedVisionCall[] {
  return imagePaths.map((imagePath) => {
    const inferred = inferVisionTool(messageText, imagePath);
    return {
      tool: inferred.tool,
      imagePath,
      args: {
        image_path: imagePath,
        ...inferred.args,
      },
      reason: inferred.reason,
    };
  });
}
