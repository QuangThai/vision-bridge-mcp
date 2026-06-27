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
  output_format: z.literal("markdown_json").default("markdown_json"),
} as const;

export const ocrImageMcpInputSchema = {
  image_path: z.string().min(1).optional(),
  image_url: z.string().url().optional(),
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
  compareImages?: typeof compareImages;
  shouldUseAtlasVision?: typeof shouldUseAtlasVision;
}

function formatToolFailure(error: unknown): string {
  if (
    error instanceof ConfigError ||
    error instanceof ImageError ||
    error instanceof PathPolicyError ||
    error instanceof ProviderError
  ) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export function registerAnalyzeImageTool(
  server: McpServer,
  dependencies: AtlasServerDependencies = {},
): void {
  server.registerTool(
    ANALYZE_IMAGE_TOOL_NAME,
    {
      description: ANALYZE_IMAGE_TOOL_DESCRIPTION,
      inputSchema: analyzeImageMcpInputSchema,
      outputSchema: analyzeImageOutputSchema.shape,
    },
    async (args) => {
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
    async (args) => {
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
    async (args) => {
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
    async (args) => {
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
    async (args) => {
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
    async (args) => {
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
    async (args) => {
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
      }
    },
  );
}

export function createAtlasMcpServer(dependencies: AtlasServerDependencies = {}): McpServer {
  const server = new McpServer({
    name: PACKAGE_NAME,
    version: VERSION,
  });

  registerAnalyzeImageTool(server, dependencies);
  registerExtractRegionTool(server, dependencies);
  registerAnalyzeImageBatchTool(server, dependencies);
  registerOcrImageTool(server, dependencies);
  registerAnalyzeUiScreenshotTool(server, dependencies);
  registerCompareImagesTool(server, dependencies);
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
    registerAnalyzeImageTool(server, dependencies);
    registerExtractRegionTool(server, dependencies);
    registerAnalyzeImageBatchTool(server, dependencies);
    registerOcrImageTool(server, dependencies);
    registerAnalyzeUiScreenshotTool(server, dependencies);
    registerCompareImagesTool(server, dependencies);
  }

  registerShouldUseAtlasVisionTool(server, dependencies);
  registerVisionInstructionsPrompt(server);

  const transport = new StdioServerTransport();
  await connectAtlasMcpServer(server, transport);
}
