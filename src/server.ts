import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import { type AtlasConfig, ConfigError, loadConfig } from "./config.js";
import { PACKAGE_NAME, VERSION } from "./constants.js";
import {
  analyzeImageDetailLevelSchema,
  analyzeImageModeSchema,
  analyzeImageOutputSchema,
  analyzeUiScreenshotOutputSchema,
  compareImagesOutputSchema,
  ocrImageOutputSchema,
} from "./extraction/schemas.js";
import { ImageError } from "./image/errors.js";
import { ProviderError } from "./providers/errors.js";
import type { FetchFn } from "./providers/types.js";
import { PathPolicyError } from "./security/path-policy.js";
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
  OCR_IMAGE_TOOL_DESCRIPTION,
  OCR_IMAGE_TOOL_NAME,
  type OcrImageDependencies,
  ocrImage,
} from "./tools/ocr-image.js";

export const analyzeImageMcpInputSchema = {
  image_path: z.string().min(1),
  image_url: z.string().url().optional(),
  prompt: z.string().optional(),
  mode: analyzeImageModeSchema.default("general"),
  detail_level: analyzeImageDetailLevelSchema.default("standard"),
  output_format: z.literal("markdown_json").default("markdown_json"),
} as const;

export const ocrImageMcpInputSchema = {
  image_path: z.string().min(1),
  preserve_layout: z.boolean().default(true),
  extract_tables: z.boolean().default(false),
  extract_code: z.boolean().default(false),
} as const;

export const analyzeUiScreenshotMcpInputSchema = {
  image_path: z.string().min(1),
  target_framework: z
    .enum(["react", "vue", "svelte", "flutter", "swiftui", "android", "unknown"])
    .default("unknown"),
  style_system: z
    .enum(["tailwind", "css_modules", "shadcn", "mui", "native", "unknown"])
    .default("unknown"),
  goal: z.enum(["describe", "implement", "debug", "accessibility_review"]).default("describe"),
} as const;

export const compareImagesMcpInputSchema = {
  before_path: z.string().min(1),
  after_path: z.string().min(1),
  focus: z.enum(["layout", "text", "color", "component", "general"]).default("general"),
  severity_threshold: z.enum(["low", "medium", "high"]).default("low"),
} as const;

export interface AtlasServerDependencies {
  config?: AtlasConfig;
  cwd?: string;
  fetch?: FetchFn;
  analyze?: typeof analyzeImage;
  ocr?: typeof ocrImage;
  analyzeUiScreenshot?: typeof analyzeUiScreenshot;
  compareImages?: typeof compareImages;
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

export function createAtlasMcpServer(dependencies: AtlasServerDependencies = {}): McpServer {
  const server = new McpServer({
    name: PACKAGE_NAME,
    version: VERSION,
  });

  registerAnalyzeImageTool(server, dependencies);
  registerOcrImageTool(server, dependencies);
  registerAnalyzeUiScreenshotTool(server, dependencies);
  registerCompareImagesTool(server, dependencies);

  return server;
}

export async function connectAtlasMcpServer(
  server: McpServer,
  transport: Transport,
): Promise<void> {
  await server.connect(transport);
}

export async function serveStdio(dependencies: AtlasServerDependencies = {}): Promise<void> {
  const server = createAtlasMcpServer(dependencies);
  const transport = new StdioServerTransport();
  await connectAtlasMcpServer(server, transport);
}
