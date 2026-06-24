import { z } from "zod";

export const analyzeImageModeSchema = z.enum([
  "general",
  "diagram",
  "chart",
  "code_from_screenshot",
  "document",
  "error_screenshot",
]);

export const analyzeImageDetailLevelSchema = z.enum(["brief", "standard", "detailed"]);

export const analyzeImageInputSchema = z
  .object({
    image_path: z.string().min(1).optional(),
    image_url: z.string().url().optional(),
    prompt: z.string().optional(),
    mode: analyzeImageModeSchema.default("general"),
    detail_level: analyzeImageDetailLevelSchema.default("standard"),
    output_format: z.literal("markdown_json").default("markdown_json"),
  })
  .superRefine((value, context) => {
    if (!value.image_path?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "image_path is required for MVP. Remote image_url support is not implemented yet.",
        path: ["image_path"],
      });
    }

    if (value.image_url) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "image_url is not supported in MVP. Use a local image_path.",
        path: ["image_url"],
      });
    }
  });

export const sourceRegionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  unit: z.enum(["pixel", "relative", "unknown"]).default("unknown"),
});

export const observationSchema = z.object({
  id: z.string(),
  type: z.enum(["visual", "text", "layout", "object", "error", "code", "diagram"]),
  content: z.string(),
  confidence: z.number().min(0).max(1),
  source_region: sourceRegionSchema.optional(),
});

export const inferenceSchema = z.object({
  id: z.string(),
  content: z.string(),
  based_on: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
});

export const graphNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
});

export const graphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.string(),
});

export const chartTableRowSchema = z.record(z.string(), z.union([z.string(), z.number()]));

export const chartTableSchema = z.object({
  caption: z.string().optional(),
  headers: z.array(z.string()).default([]),
  rows: z.array(chartTableRowSchema).default([]),
});

export const analyzeImageOutputSchema = z.object({
  summary: z.string(),
  observations: z.array(observationSchema).default([]),
  inferences: z.array(inferenceSchema).default([]),
  uncertainties: z.array(z.string()).default([]),
  recommended_next_steps: z.array(z.string()).default([]),
  security_notes: z.array(z.string()).default([]),
  provider: z.object({
    name: z.string(),
    model: z.string(),
  }),
  mermaid: z.string().optional(),
  tables: z.array(chartTableSchema).default([]),
  graph: z
    .object({
      nodes: z.array(graphNodeSchema).default([]),
      edges: z.array(graphEdgeSchema).default([]),
    })
    .optional(),
});

export type AnalyzeImageMode = z.infer<typeof analyzeImageModeSchema>;
export type AnalyzeImageInput = z.infer<typeof analyzeImageInputSchema>;
export type AnalyzeImageOutput = z.infer<typeof analyzeImageOutputSchema>;

export const ocrImageRegionSchema = z.enum(["top-left", "center", "bottom-right", "unknown"]);

export const ocrVisibleTextBlockSchema = z.object({
  id: z.string(),
  text: z.string(),
  region: ocrImageRegionSchema.default("unknown"),
  confidence: z.number().min(0).max(1),
});

export const ocrImageInputSchema = z.object({
  image_path: z.string().min(1),
  preserve_layout: z.boolean().default(true),
  extract_tables: z.boolean().default(false),
  extract_code: z.boolean().default(false),
});

export const ocrImageOutputSchema = z.object({
  summary: z.string(),
  visible_text: z.array(ocrVisibleTextBlockSchema).default([]),
  layout_text: z.string().default(""),
  warnings: z.array(z.string()).default([]),
});

export type OcrImageRegion = z.infer<typeof ocrImageRegionSchema>;
export type OcrVisibleTextBlock = z.infer<typeof ocrVisibleTextBlockSchema>;
export type OcrImageInput = z.infer<typeof ocrImageInputSchema>;
export type OcrImageOutput = z.infer<typeof ocrImageOutputSchema>;

export const uiTargetFrameworkSchema = z.enum([
  "react",
  "vue",
  "svelte",
  "flutter",
  "swiftui",
  "android",
  "unknown",
]);

export const uiStyleSystemSchema = z.enum([
  "tailwind",
  "css_modules",
  "shadcn",
  "mui",
  "native",
  "unknown",
]);

export const uiScreenshotGoalSchema = z.enum([
  "describe",
  "implement",
  "debug",
  "accessibility_review",
]);

export const uiScreenTypeSchema = z.enum([
  "login",
  "dashboard",
  "form",
  "landing",
  "settings",
  "modal",
  "unknown",
]);

export const uiElementTypeSchema = z.enum([
  "button",
  "input",
  "text",
  "image",
  "nav",
  "card",
  "table",
  "modal",
  "unknown",
]);

export const uiElementStateSchema = z.enum([
  "default",
  "disabled",
  "active",
  "error",
  "selected",
  "unknown",
]);

export const uiElementSchema = z.object({
  id: z.string(),
  type: uiElementTypeSchema,
  label: z.string(),
  state: uiElementStateSchema.default("unknown"),
  position: z.string().default("unknown"),
  implementation_hint: z.string().default(""),
  confidence: z.number().min(0).max(1),
});

export const uiLayoutSchema = z.object({
  structure: z.string().default(""),
  spacing_notes: z.array(z.string()).default([]),
  responsive_hints: z.array(z.string()).default([]),
});

export const analyzeUiScreenshotInputSchema = z.object({
  image_path: z.string().min(1),
  target_framework: uiTargetFrameworkSchema.default("unknown"),
  style_system: uiStyleSystemSchema.default("unknown"),
  goal: uiScreenshotGoalSchema.default("describe"),
});

export const analyzeUiScreenshotOutputSchema = z.object({
  summary: z.string(),
  screen_type: uiScreenTypeSchema.default("unknown"),
  ui_elements: z.array(uiElementSchema).default([]),
  layout: uiLayoutSchema.default({
    structure: "",
    spacing_notes: [],
    responsive_hints: [],
  }),
  accessibility_issues: z.array(z.string()).default([]),
  implementation_plan: z.array(z.string()).default([]),
  uncertainties: z.array(z.string()).default([]),
});

export type UiTargetFramework = z.infer<typeof uiTargetFrameworkSchema>;
export type UiStyleSystem = z.infer<typeof uiStyleSystemSchema>;
export type UiScreenshotGoal = z.infer<typeof uiScreenshotGoalSchema>;
export type UiScreenType = z.infer<typeof uiScreenTypeSchema>;
export type UiElement = z.infer<typeof uiElementSchema>;
export type UiLayout = z.infer<typeof uiLayoutSchema>;
export type AnalyzeUiScreenshotInput = z.infer<typeof analyzeUiScreenshotInputSchema>;
export type AnalyzeUiScreenshotOutput = z.infer<typeof analyzeUiScreenshotOutputSchema>;

export const compareImagesFocusSchema = z.enum(["layout", "text", "color", "component", "general"]);

export const compareImagesSeverityThresholdSchema = z.enum(["low", "medium", "high"]);

export const compareImagesDifferenceTypeSchema = z.enum([
  "layout",
  "text",
  "color",
  "missing_element",
  "new_element",
  "alignment",
  "unknown",
]);

export const compareImagesSeveritySchema = z.enum(["low", "medium", "high"]);

export const regressionLikelihoodSchema = z.enum(["none", "low", "medium", "high"]);

export const compareImagesDifferenceSchema = z.object({
  id: z.string(),
  type: compareImagesDifferenceTypeSchema,
  description: z.string(),
  severity: compareImagesSeveritySchema,
  before_evidence: z.string().default(""),
  after_evidence: z.string().default(""),
  confidence: z.number().min(0).max(1),
});

export const compareImagesInputSchema = z.object({
  before_path: z.string().min(1),
  after_path: z.string().min(1),
  focus: compareImagesFocusSchema.default("general"),
  severity_threshold: compareImagesSeverityThresholdSchema.default("low"),
});

export const compareImagesOutputSchema = z.object({
  summary: z.string(),
  differences: z.array(compareImagesDifferenceSchema).default([]),
  regression_likelihood: regressionLikelihoodSchema.default("none"),
  recommended_next_steps: z.array(z.string()).default([]),
});

export type CompareImagesFocus = z.infer<typeof compareImagesFocusSchema>;
export type CompareImagesSeverityThreshold = z.infer<typeof compareImagesSeverityThresholdSchema>;
export type CompareImagesDifference = z.infer<typeof compareImagesDifferenceSchema>;
export type CompareImagesInput = z.infer<typeof compareImagesInputSchema>;
export type CompareImagesOutput = z.infer<typeof compareImagesOutputSchema>;
export type RegressionLikelihood = z.infer<typeof regressionLikelihoodSchema>;

// ── extract_region ──────────────────────────────────────────────────────────────

export const imageRegionSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(1),
  height: z.number().int().min(1),
});

export type ImageRegion = z.infer<typeof imageRegionSchema>;

export const extractRegionInputSchema = z.object({
  image_path: z.string().min(1),
  region: imageRegionSchema,
  prompt: z.string().optional(),
  mode: analyzeImageModeSchema.default("general"),
  detail_level: analyzeImageDetailLevelSchema.default("standard"),
});

export type ExtractRegionInput = z.infer<typeof extractRegionInputSchema>;

// ── analyze_image_batch ─────────────────────────────────────────────────────────

export const batchImageItemSchema = z.object({
  image_path: z.string().min(1),
  prompt: z.string().optional(),
  mode: analyzeImageModeSchema.default("general"),
});

export type BatchImageItem = z.infer<typeof batchImageItemSchema>;

export const analyzeImageBatchInputSchema = z.object({
  images: z.array(batchImageItemSchema).min(1).max(10),
  detail_level: analyzeImageDetailLevelSchema.default("standard"),
});

export type AnalyzeImageBatchInput = z.infer<typeof analyzeImageBatchInputSchema>;

export const analyzeImageBatchItemOutputSchema = z.object({
  index: z.number().int().min(0),
  image_path: z.string(),
  result: analyzeImageOutputSchema,
});

export type AnalyzeImageBatchItemOutput = z.infer<typeof analyzeImageBatchItemOutputSchema>;

export const analyzeImageBatchOutputSchema = z.object({
  summary: z.string(),
  items: z.array(analyzeImageBatchItemOutputSchema),
  total_processed: z.number().int(),
  failed_count: z.number().int().default(0),
  errors: z.array(z.object({
    index: z.number().int(),
    image_path: z.string(),
    error: z.string(),
  })).default([]),
  provider: z.object({
    name: z.string(),
    model: z.string(),
  }),
});

export type AnalyzeImageBatchOutput = z.infer<typeof analyzeImageBatchOutputSchema>;
