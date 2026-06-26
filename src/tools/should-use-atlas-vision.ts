import { planImageIntercept } from "../capabilities/index.js";
import {
  type ShouldUseAtlasVisionInput,
  type ShouldUseAtlasVisionOutput,
  shouldUseAtlasVisionInputSchema,
  shouldUseAtlasVisionOutputSchema,
} from "../extraction/schemas.js";

export const SHOULD_USE_ATLAS_VISION_TOOL_NAME = "should_use_atlas_vision";

export const SHOULD_USE_ATLAS_VISION_TOOL_DESCRIPTION =
  "Check whether the coding agent should call Atlas Vision tools for the current main model. " +
  "Call this before analyze_image, ocr_image, or other Atlas tools when routing is unclear. " +
  "Returns should_use_atlas_vision=false when the main model supports native vision " +
  "(e.g. GPT-4o, Claude, Composer) — the model can see images directly. " +
  "Returns true for text-only models (DeepSeek, GLM) when images are referenced.";

export interface ShouldUseAtlasVisionResult {
  markdown: string;
  structured: ShouldUseAtlasVisionOutput;
}

export interface ShouldUseAtlasVisionDependencies {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

function buildRecommendation(shouldUse: boolean, supportsVision: boolean): string {
  if (!shouldUse && supportsVision) {
    return "Main model has native vision — read images directly; skip Atlas Vision MCP tools.";
  }
  if (shouldUse) {
    return "Main model is text-only or images need bridge — call Atlas Vision MCP tools.";
  }
  return "No Atlas Vision action needed for this prompt.";
}

function renderMarkdown(output: ShouldUseAtlasVisionOutput): string {
  const lines = [
    "## Atlas Vision routing",
    "",
    `**Model:** ${output.main_model_ref}`,
    `**Native vision:** ${output.supports_native_vision ? "yes" : "no"}`,
    `**Use Atlas Vision:** ${output.should_use_atlas_vision ? "yes" : "no"}`,
    `**Source:** ${output.capability_source}`,
    "",
    output.reason,
    "",
    output.recommendation,
  ];

  if (output.images_detected > 0) {
    lines.push("", `Images detected in message: ${output.images_detected}`);
  }

  return lines.join("\n");
}

export async function shouldUseAtlasVision(
  input: ShouldUseAtlasVisionInput,
  dependencies: ShouldUseAtlasVisionDependencies = {},
): Promise<ShouldUseAtlasVisionResult> {
  const parsed = shouldUseAtlasVisionInputSchema.parse(input);
  const env = dependencies.env ?? process.env;
  const messageText = parsed.message_text?.trim() || "check ./image.png";

  const plan = await planImageIntercept(
    {
      mainModelRef: parsed.main_model_ref,
      messageText,
      runtimeSupportsVision: parsed.supports_vision,
      env,
    },
    {
      interceptMode: env.ATLAS_INTERCEPT_MODE?.trim().toLowerCase() as
        | "auto"
        | "text-only-only"
        | "always"
        | "never"
        | undefined,
    },
  );

  const shouldUse = plan.shouldIntercept;
  const structured: ShouldUseAtlasVisionOutput = {
    main_model_ref: parsed.main_model_ref,
    supports_native_vision: plan.capabilities?.supportsVision ?? false,
    should_use_atlas_vision: shouldUse,
    capability_source: plan.capabilities?.source ?? "unknown",
    reason: plan.reason,
    recommendation: buildRecommendation(shouldUse, plan.capabilities?.supportsVision ?? false),
    images_detected: plan.images.length,
  };

  return {
    markdown: renderMarkdown(structured),
    structured: shouldUseAtlasVisionOutputSchema.parse(structured),
  };
}
