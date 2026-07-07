import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import { getModelCapabilities, parseModelRef } from "./capabilities/index.js";
import { type AtlasConfig, ConfigError, loadConfig } from "./config.js";
import { PACKAGE_NAME, VERSION } from "./constants.js";
import {
  analyzeImageBatchOutputSchema,
  analyzeImageDetailLevelSchema,
  analyzeImageModeSchema,
  analyzeImageOutputSchema,
  analyzeUiScreenshotOutputSchema,
  compareImagesOutputSchema,
  ocrImageOutputSchema,
  reasoningEffortSchema,
  shouldUseAtlasVisionOutputSchema,
} from "./extraction/schemas.js";
import { ImageError } from "./image/errors.js";
import { registerVisionInstructionsPrompt } from "./prompts/vision-instructions.js";
import { ProviderError } from "./providers/errors.js";
import type { FetchFn } from "./providers/types.js";
import { PathPolicyError } from "./security/path-policy.js";
import {
  ANALYZE_IMAGE_BATCH_TOOL_DESCRIPTION,
  ANALYZE_IMAGE_BATCH_TOOL_NAME,
  type AnalyzeImageBatchDependencies,
  analyzeImageBatch,
} from "./tools/analyze-image-batch.js";
import {
  ANALYZE_IMAGE_TOOL_DESCRIPTION,
  ANALYZE_IMAGE_TOOL_NAME,
  type AnalyzeImageDependencies,
  analyzeImage,
} from "./tools/analyze-image.js";
import {
  ANALYZE_UI_SCREENSHOT_TOOL_DESCRIPTION,
  ANALYZE_UI_SCREENSHOT_TOOL_NAME,
  type AnalyzeUiScreenshotDependencies,
  analyzeUiScreenshot,
} from "./tools/analyze-ui-screenshot.js";
import {
  ANALYZE_CLIPBOARD_TOOL_DESCRIPTION,
  ANALYZE_CLIPBOARD_TOOL_NAME,
  ANALYZE_UI_CLIPBOARD_TOOL_DESCRIPTION,
  ANALYZE_UI_CLIPBOARD_TOOL_NAME,
  type AnalyzeClipboardDependencies,
  type AnalyzeUiClipboardDependencies,
  ClipboardImageError,
  DIAGNOSE_CLIPBOARD_TOOL_DESCRIPTION,
  DIAGNOSE_CLIPBOARD_TOOL_NAME,
  type DiagnoseClipboardDependencies,
  OCR_CLIPBOARD_TOOL_DESCRIPTION,
  OCR_CLIPBOARD_TOOL_NAME,
  type OcrClipboardDependencies,
  analyzeClipboard,
  analyzeUiClipboard,
  diagnoseClipboard,
  ocrClipboard,
} from "./tools/clipboard.js";
import {
  COMPARE_IMAGES_TOOL_DESCRIPTION,
  COMPARE_IMAGES_TOOL_NAME,
  type CompareImagesDependencies,
  compareImages,
} from "./tools/compare-images.js";
import {
  EXTRACT_REGION_TOOL_DESCRIPTION,
  EXTRACT_REGION_TOOL_NAME,
  type ExtractRegionDependencies,
  extractRegion,
} from "./tools/extract-region.js";
import {
  OCR_IMAGE_TOOL_DESCRIPTION,
  OCR_IMAGE_TOOL_NAME,
  type OcrImageDependencies,
  ocrImage,
} from "./tools/ocr-image.js";
import { startProgressHeartbeat } from "./tools/progress-heartbeat.js";
import {
  SHOULD_USE_ATLAS_VISION_TOOL_DESCRIPTION,
  SHOULD_USE_ATLAS_VISION_TOOL_NAME,
  shouldUseAtlasVision,
} from "./tools/should-use-atlas-vision.js";
import { setupConsoleRedirection } from "./utils/console.js";

export const analyzeImageMcpInputSchema = {
  image_path: z.string().optional(),
  image_url: z.string().url().optional(),
  prompt: z.string().optional(),
  mode: analyzeImageModeSchema.default("general"),
  detail_level: analyzeImageDetailLevelSchema.default("standard"),
  reasoning_effort: reasoningEffortSchema
    .optional()
    .describe(
      "How hard the vision model should think. Omit to use the fast configured default — " +
        "enough unless the task needs actual REASONING about what's visible (not just " +
        "describing/transcribing it), e.g. explaining why, inferring intent, cross-referencing " +
        "clues. Escalating costs real time with no guaranteed gain otherwise, so don't reach " +
        "for it reflexively. If you do escalate, retry the SAME call with a higher level — " +
        "low → medium → high — before switching model.",
    ),
  model: z
    .string()
    .optional()
    .describe(
      "Override the vision model id. Leave UNSET in normal use. Only set this as a LAST RESORT — " +
        "after reasoning_effort=high still gives an inadequate result — to switch to a more " +
        "capable (slower, costlier) model. See the tool description for the model to escalate to.",
    ),
  output_format: z.literal("markdown_json").default("markdown_json"),
} as const;

export const ocrImageMcpInputSchema = {
  image_path: z.string().min(1).optional(),
  image_url: z.string().url().optional(),
  preserve_layout: z.boolean().default(true),
  extract_tables: z.boolean().default(false),
  extract_code: z.boolean().default(false),
} as const;

export const analyzeClipboardMcpInputSchema = {
  prompt: z.string().optional(),
  mode: analyzeImageModeSchema.default("general"),
  detail_level: analyzeImageDetailLevelSchema.default("standard"),
  output_format: z.literal("markdown_json").default("markdown_json"),
} as const;

export const diagnoseClipboardMcpInputSchema = {
  prompt: z.string().optional(),
  detail_level: analyzeImageDetailLevelSchema.default("standard"),
  output_format: z.literal("markdown_json").default("markdown_json"),
} as const;

export const ocrClipboardMcpInputSchema = {
  preserve_layout: z.boolean().default(true),
  extract_tables: z.boolean().default(false),
  extract_code: z.boolean().default(false),
} as const;

export const analyzeUiScreenshotMcpInputSchema = {
  image_path: z.string().min(1).optional(),
  image_url: z.string().url().optional(),
  target_framework: z
    .enum(["react", "vue", "svelte", "flutter", "swiftui", "android", "unknown"])
    .default("unknown"),
  style_system: z
    .enum(["tailwind", "css_modules", "shadcn", "mui", "native", "unknown"])
    .default("unknown"),
  goal: z.enum(["describe", "implement", "debug", "accessibility_review"]).default("describe"),
} as const;

export const analyzeUiClipboardMcpInputSchema = {
  target_framework: z
    .enum(["react", "vue", "svelte", "flutter", "swiftui", "android", "unknown"])
    .default("unknown"),
  style_system: z
    .enum(["tailwind", "css_modules", "shadcn", "mui", "native", "unknown"])
    .default("unknown"),
  goal: z.enum(["describe", "implement", "debug", "accessibility_review"]).default("describe"),
} as const;

export const compareImagesMcpInputSchema = {
  before_path: z.string().min(1).optional(),
  before_url: z.string().url().optional(),
  after_path: z.string().min(1).optional(),
  after_url: z.string().url().optional(),
  focus: z.enum(["layout", "text", "color", "component", "general"]).default("general"),
  severity_threshold: z.enum(["low", "medium", "high"]).default("low"),
  diff_path: z.string().optional(),
} as const;

export const extractRegionMcpInputSchema = {
  image_path: z.string().min(1).optional(),
  image_url: z.string().url().optional(),
  region: z.object({
    x: z.number().int().min(0),
    y: z.number().int().min(0),
    width: z.number().int().min(1),
    height: z.number().int().min(1),
  }),
  prompt: z.string().optional(),
  mode: analyzeImageModeSchema.default("general"),
  detail_level: analyzeImageDetailLevelSchema.default("standard"),
} as const;

export const shouldUseAtlasVisionMcpInputSchema = {
  main_model_ref: z.string().min(1),
  supports_vision: z.boolean().optional(),
  message_text: z.string().optional(),
} as const;

export const analyzeImageBatchMcpInputSchema = {
  images: z
    .array(
      z.object({
        image_path: z.string().min(1).optional(),
        image_url: z.string().url().optional(),
        prompt: z.string().optional(),
        mode: analyzeImageModeSchema.default("general"),
      }),
    )
    .min(1)
    .max(10),
  detail_level: analyzeImageDetailLevelSchema.default("standard"),
} as const;

export interface AtlasServerDependencies {
  config?: AtlasConfig;
  cwd?: string;
  fetch?: FetchFn;
  env?: NodeJS.ProcessEnv;
  analyze?: typeof analyzeImage;
  analyzeImageBatch?: typeof analyzeImageBatch;
  extractRegion?: typeof extractRegion;
  ocr?: typeof ocrImage;
  analyzeUiScreenshot?: typeof analyzeUiScreenshot;
  analyzeClipboard?: typeof analyzeClipboard;
  ocrClipboard?: typeof ocrClipboard;
  analyzeUiClipboard?: typeof analyzeUiClipboard;
  diagnoseClipboard?: typeof diagnoseClipboard;
  compareImages?: typeof compareImages;
  shouldUseAtlasVision?: typeof shouldUseAtlasVision;
}

function formatToolFailure(error: unknown): string {
  if (error instanceof ClipboardImageError) {
    return "Clipboard does not contain an image. Copy a screenshot/image first, then ask Atlas to analyze the clipboard without using native image attachment.";
  }

  if (error instanceof ConfigError || error instanceof PathPolicyError) {
    // Sanitize internal path/configuration details from error messages
    return "Configuration or path policy error. Check your setup and allowed directories.";
  }

  if (error instanceof ImageError) {
    // Return safe subset of image errors without leaking file paths
    if (error.message.includes("not found") || error.message.includes("not_allowed")) {
      return "Image file not found or path not allowed.";
    }
    if (error.message.includes("timeout") || error.message.includes("interrupted")) {
      return "Failed to download image: connection timed out or interrupted.";
    }
    if (error.message.includes("Content-Type") || error.message.includes("not an image")) {
      return "The URL does not point to a supported image format.";
    }
    if (error.message.includes("exceeded maximum size")) {
      return "The downloaded image exceeds the maximum allowed size.";
    }
    // Generic image error with no sensitive details
    return "An image processing error occurred.";
  }

  if (error instanceof ProviderError) {
    // Return safe error without leaking provider/model details
    if (error.code === "auth") {
      return "Vision provider authentication failed. Check your API key configuration.";
    }
    if (error.code === "timeout") {
      return "Vision provider request timed out. Check network connectivity.";
    }
    if (error.code === "rate_limit") {
      return "Rate limited by vision provider. Retry later or reduce request frequency.";
    }
    return "A vision provider error occurred. Check your provider configuration.";
  }

  if (error instanceof Error) {
    return "An unexpected error occurred.";
  }

  return "Unknown error";
}

/**
 * Build the analyze_image description, appending an escalation policy so the
 * calling model knows how to get a better result when the default is not enough.
 * The escalation model is read from VISION_ESCALATION_MODEL so the model id is
 * not hard-coded into this provider-agnostic project.
 */
function buildAnalyzeImageDescription(env: NodeJS.ProcessEnv): string {
  const escalationModel = env.VISION_ESCALATION_MODEL?.trim();
  const policy = `\n\nQuality escalation: this tool defaults to a fast, low-effort pass, which is enough unless the task needs actual reasoning over the image (explaining why, inferring intent, cross-referencing clues) rather than plain description — raising effort rarely helps the latter and costs real time. If a result IS too shallow, incomplete, or wrong, retry the SAME image with a higher \`reasoning_effort\` — escalate low → medium → high. Always prefer raising reasoning_effort (cheaper) before changing the model.${
    escalationModel
      ? ` Only if reasoning_effort=high is still inadequate, set \`model\` to "${escalationModel}" for a more capable (slower, costlier) pass.`
      : ""
  }`;
  return ANALYZE_IMAGE_TOOL_DESCRIPTION + policy;
}

export function registerAnalyzeImageTool(
  server: McpServer,
  dependencies: AtlasServerDependencies = {},
): void {
  server.registerTool(
    ANALYZE_IMAGE_TOOL_NAME,
    {
      description: buildAnalyzeImageDescription(dependencies.env ?? process.env),
      inputSchema: analyzeImageMcpInputSchema,
      outputSchema: analyzeImageOutputSchema.shape,
    },
    async (args, extra) => {
      const stopHeartbeat = startProgressHeartbeat(extra);
      try {
        const config = dependencies.config ?? loadConfig();
        const analyze = dependencies.analyze ?? analyzeImage;
        const analyzeDeps: AnalyzeImageDependencies = {
          config,
          cwd: dependencies.cwd,
          fetch: dependencies.fetch,
        };
        const result = await analyze(args, analyzeDeps);

        return {
          content: [{ type: "text" as const, text: result.markdown }],
          structuredContent: result.structured,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: formatToolFailure(error) }],
        };
      } finally {
        stopHeartbeat();
      }
    },
  );
}

export function registerExtractRegionTool(
  server: McpServer,
  dependencies: AtlasServerDependencies = {},
): void {
  server.registerTool(
    EXTRACT_REGION_TOOL_NAME,
    {
      description: EXTRACT_REGION_TOOL_DESCRIPTION,
      inputSchema: extractRegionMcpInputSchema,
      outputSchema: analyzeImageOutputSchema.shape,
    },
    async (args, extra) => {
      const stopHeartbeat = startProgressHeartbeat(extra);
      try {
        const config = dependencies.config ?? loadConfig();
        const extract = dependencies.extractRegion ?? extractRegion;
        const extractDeps: ExtractRegionDependencies = {
          config,
          cwd: dependencies.cwd,
          fetch: dependencies.fetch,
        };
        const result = await extract(args, extractDeps);

        return {
          content: [{ type: "text" as const, text: result.markdown }],
          structuredContent: result.structured,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: formatToolFailure(error) }],
        };
      } finally {
        stopHeartbeat();
      }
    },
  );
}

export function registerAnalyzeImageBatchTool(
  server: McpServer,
  dependencies: AtlasServerDependencies = {},
): void {
  server.registerTool(
    ANALYZE_IMAGE_BATCH_TOOL_NAME,
    {
      description: ANALYZE_IMAGE_BATCH_TOOL_DESCRIPTION,
      inputSchema: analyzeImageBatchMcpInputSchema,
      outputSchema: analyzeImageBatchOutputSchema.shape,
    },
    async (args, extra) => {
      const stopHeartbeat = startProgressHeartbeat(extra);
      try {
        const config = dependencies.config ?? loadConfig();
        const analyzeBatch = dependencies.analyzeImageBatch ?? analyzeImageBatch;
        const batchDeps: AnalyzeImageBatchDependencies = {
          config,
          cwd: dependencies.cwd,
          fetch: dependencies.fetch,
        };
        const result = await analyzeBatch(args, batchDeps);

        return {
          content: [{ type: "text" as const, text: result.markdown }],
          structuredContent: result.structured,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: formatToolFailure(error) }],
        };
      } finally {
        stopHeartbeat();
      }
    },
  );
}

export function registerOcrImageTool(
  server: McpServer,
  dependencies: AtlasServerDependencies = {},
): void {
  server.registerTool(
    OCR_IMAGE_TOOL_NAME,
    {
      description: OCR_IMAGE_TOOL_DESCRIPTION,
      inputSchema: ocrImageMcpInputSchema,
      outputSchema: ocrImageOutputSchema.shape,
    },
    async (args, extra) => {
      const stopHeartbeat = startProgressHeartbeat(extra);
      try {
        const config = dependencies.config ?? loadConfig();
        const ocr = dependencies.ocr ?? ocrImage;
        const ocrDeps: OcrImageDependencies = {
          config,
          cwd: dependencies.cwd,
          fetch: dependencies.fetch,
        };
        const result = await ocr(args, ocrDeps);

        return {
          content: [{ type: "text" as const, text: result.markdown }],
          structuredContent: result.structured,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: formatToolFailure(error) }],
        };
      } finally {
        stopHeartbeat();
      }
    },
  );
}

export function registerAnalyzeClipboardTool(
  server: McpServer,
  dependencies: AtlasServerDependencies = {},
): void {
  server.registerTool(
    ANALYZE_CLIPBOARD_TOOL_NAME,
    {
      description: ANALYZE_CLIPBOARD_TOOL_DESCRIPTION,
      inputSchema: analyzeClipboardMcpInputSchema,
      outputSchema: analyzeImageOutputSchema.shape,
    },
    async (args, extra) => {
      const stopHeartbeat = startProgressHeartbeat(extra);
      try {
        const config = dependencies.config ?? loadConfig();
        const analyze = dependencies.analyzeClipboard ?? analyzeClipboard;
        const clipboardDeps: AnalyzeClipboardDependencies = {
          config,
          cwd: dependencies.cwd,
          fetch: dependencies.fetch,
        };
        const result = await analyze(args, clipboardDeps);

        return {
          content: [{ type: "text" as const, text: result.markdown }],
          structuredContent: result.structured,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: formatToolFailure(error) }],
        };
      } finally {
        stopHeartbeat();
      }
    },
  );
}

export function registerDiagnoseClipboardTool(
  server: McpServer,
  dependencies: AtlasServerDependencies = {},
): void {
  server.registerTool(
    DIAGNOSE_CLIPBOARD_TOOL_NAME,
    {
      description: DIAGNOSE_CLIPBOARD_TOOL_DESCRIPTION,
      inputSchema: diagnoseClipboardMcpInputSchema,
      outputSchema: analyzeImageOutputSchema.shape,
    },
    async (args, extra) => {
      const stopHeartbeat = startProgressHeartbeat(extra);
      try {
        const config = dependencies.config ?? loadConfig();
        const diagnose = dependencies.diagnoseClipboard ?? diagnoseClipboard;
        const clipboardDeps: DiagnoseClipboardDependencies = {
          config,
          cwd: dependencies.cwd,
          fetch: dependencies.fetch,
        };
        const result = await diagnose(args, clipboardDeps);

        return {
          content: [{ type: "text" as const, text: result.markdown }],
          structuredContent: result.structured,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: formatToolFailure(error) }],
        };
      } finally {
        stopHeartbeat();
      }
    },
  );
}

export function registerOcrClipboardTool(
  server: McpServer,
  dependencies: AtlasServerDependencies = {},
): void {
  server.registerTool(
    OCR_CLIPBOARD_TOOL_NAME,
    {
      description: OCR_CLIPBOARD_TOOL_DESCRIPTION,
      inputSchema: ocrClipboardMcpInputSchema,
      outputSchema: ocrImageOutputSchema.shape,
    },
    async (args, extra) => {
      const stopHeartbeat = startProgressHeartbeat(extra);
      try {
        const config = dependencies.config ?? loadConfig();
        const ocr = dependencies.ocrClipboard ?? ocrClipboard;
        const clipboardDeps: OcrClipboardDependencies = {
          config,
          cwd: dependencies.cwd,
          fetch: dependencies.fetch,
        };
        const result = await ocr(args, clipboardDeps);

        return {
          content: [{ type: "text" as const, text: result.markdown }],
          structuredContent: result.structured,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: formatToolFailure(error) }],
        };
      } finally {
        stopHeartbeat();
      }
    },
  );
}

export function registerAnalyzeUiClipboardTool(
  server: McpServer,
  dependencies: AtlasServerDependencies = {},
): void {
  server.registerTool(
    ANALYZE_UI_CLIPBOARD_TOOL_NAME,
    {
      description: ANALYZE_UI_CLIPBOARD_TOOL_DESCRIPTION,
      inputSchema: analyzeUiClipboardMcpInputSchema,
      outputSchema: analyzeUiScreenshotOutputSchema.shape,
    },
    async (args, extra) => {
      const stopHeartbeat = startProgressHeartbeat(extra);
      try {
        const config = dependencies.config ?? loadConfig();
        const analyzeUi = dependencies.analyzeUiClipboard ?? analyzeUiClipboard;
        const clipboardDeps: AnalyzeUiClipboardDependencies = {
          config,
          cwd: dependencies.cwd,
          fetch: dependencies.fetch,
        };
        const result = await analyzeUi(args, clipboardDeps);

        return {
          content: [{ type: "text" as const, text: result.markdown }],
          structuredContent: result.structured,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: formatToolFailure(error) }],
        };
      } finally {
        stopHeartbeat();
      }
    },
  );
}

export function registerAnalyzeUiScreenshotTool(
  server: McpServer,
  dependencies: AtlasServerDependencies = {},
): void {
  server.registerTool(
    ANALYZE_UI_SCREENSHOT_TOOL_NAME,
    {
      description: ANALYZE_UI_SCREENSHOT_TOOL_DESCRIPTION,
      inputSchema: analyzeUiScreenshotMcpInputSchema,
      outputSchema: analyzeUiScreenshotOutputSchema.shape,
    },
    async (args, extra) => {
      const stopHeartbeat = startProgressHeartbeat(extra);
      try {
        const config = dependencies.config ?? loadConfig();
        const analyzeUi = dependencies.analyzeUiScreenshot ?? analyzeUiScreenshot;
        const analyzeUiDeps: AnalyzeUiScreenshotDependencies = {
          config,
          cwd: dependencies.cwd,
          fetch: dependencies.fetch,
        };
        const result = await analyzeUi(args, analyzeUiDeps);

        return {
          content: [{ type: "text" as const, text: result.markdown }],
          structuredContent: result.structured,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: formatToolFailure(error) }],
        };
      } finally {
        stopHeartbeat();
      }
    },
  );
}

export function registerCompareImagesTool(
  server: McpServer,
  dependencies: AtlasServerDependencies = {},
): void {
  server.registerTool(
    COMPARE_IMAGES_TOOL_NAME,
    {
      description: COMPARE_IMAGES_TOOL_DESCRIPTION,
      inputSchema: compareImagesMcpInputSchema,
      outputSchema: compareImagesOutputSchema.shape,
    },
    async (args, extra) => {
      const stopHeartbeat = startProgressHeartbeat(extra);
      try {
        const config = dependencies.config ?? loadConfig();
        const compare = dependencies.compareImages ?? compareImages;
        const compareDeps: CompareImagesDependencies = {
          config,
          cwd: dependencies.cwd,
          fetch: dependencies.fetch,
        };
        const result = await compare(args, compareDeps);

        return {
          content: [{ type: "text" as const, text: result.markdown }],
          structuredContent: result.structured,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: formatToolFailure(error) }],
        };
      } finally {
        stopHeartbeat();
      }
    },
  );
}

export function registerShouldUseAtlasVisionTool(
  server: McpServer,
  dependencies: AtlasServerDependencies = {},
): void {
  server.registerTool(
    SHOULD_USE_ATLAS_VISION_TOOL_NAME,
    {
      description: SHOULD_USE_ATLAS_VISION_TOOL_DESCRIPTION,
      inputSchema: shouldUseAtlasVisionMcpInputSchema,
      outputSchema: shouldUseAtlasVisionOutputSchema.shape,
    },
    async (args, extra) => {
      const stopHeartbeat = startProgressHeartbeat(extra);
      try {
        const check = dependencies.shouldUseAtlasVision ?? shouldUseAtlasVision;
        const result = await check(args, {
          cwd: dependencies.cwd,
          env: dependencies.env,
        });

        return {
          content: [{ type: "text" as const, text: result.markdown }],
          structuredContent: result.structured,
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: formatToolFailure(error) }],
        };
      } finally {
        stopHeartbeat();
      }
    },
  );
}

export function registerAtlasVisionTools(
  server: McpServer,
  dependencies: AtlasServerDependencies = {},
): void {
  registerAnalyzeImageTool(server, dependencies);
  registerExtractRegionTool(server, dependencies);
  registerAnalyzeImageBatchTool(server, dependencies);
  registerOcrImageTool(server, dependencies);
  registerAnalyzeClipboardTool(server, dependencies);
  registerDiagnoseClipboardTool(server, dependencies);
  registerOcrClipboardTool(server, dependencies);
  registerAnalyzeUiScreenshotTool(server, dependencies);
  registerAnalyzeUiClipboardTool(server, dependencies);
  registerCompareImagesTool(server, dependencies);
}

export function createAtlasMcpServer(dependencies: AtlasServerDependencies = {}): McpServer {
  const server = new McpServer({
    name: PACKAGE_NAME,
    version: VERSION,
  });

  registerAtlasVisionTools(server, dependencies);
  registerShouldUseAtlasVisionTool(server, dependencies);
  registerVisionInstructionsPrompt(server);

  return server;
}

export async function connectAtlasMcpServer(
  server: McpServer,
  transport: Transport,
): Promise<void> {
  await server.connect(transport);
}

/**
 * Decide whether to suppress atlas vision tools based on MAIN_MODEL_REF.
 * Returns true when the configured model has native vision (skip atlas tools).
 * On lookup failure (network error, unknown model) returns false (safe default).
 */
export async function shouldSuppressVisionTools(
  env: NodeJS.ProcessEnv,
  fetchFn?: FetchFn,
): Promise<boolean> {
  const mainModelRef = env.MAIN_MODEL_REF?.trim();
  if (!mainModelRef) return false;

  try {
    const lookup = parseModelRef(mainModelRef, env.MAIN_MODEL_PROVIDER?.trim());
    const capabilities = await getModelCapabilities(lookup, { fetch: fetchFn });
    return capabilities.supportsVision;
  } catch {
    // Network error or unknown model → safe default (don't suppress)
    return false;
  }
}

export async function serveStdio(dependencies: AtlasServerDependencies = {}): Promise<void> {
  // Redirect console output to stderr to prevent MCP protocol corruption on stdout
  setupConsoleRedirection();

  const env = dependencies.env ?? process.env;

  // ── Conditional tool registration ──
  // When MAIN_MODEL_REF is set and the model supports native vision, skip
  // registering all atlas vision tools to prevent models from calling them
  // unnecessarily (double cost). The system prompt / resources are still
  // provided so agents know atlas exists if they need it.
  const suppressTools = await shouldSuppressVisionTools(env, dependencies.fetch);

  const server = new McpServer({
    name: PACKAGE_NAME,
    version: VERSION,
  });

  if (!suppressTools) {
    registerAtlasVisionTools(server, dependencies);
  }

  registerShouldUseAtlasVisionTool(server, dependencies);
  registerVisionInstructionsPrompt(server);

  const transport = new StdioServerTransport();
  await connectAtlasMcpServer(server, transport);
}
