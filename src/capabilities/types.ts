export type CapabilitySource = "models.dev" | "override" | "heuristic" | "bundled" | "unknown";

export interface ModelCapabilities {
  modelId: string;
  providerId: string;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsReasoning: boolean;
  inputModalities: string[];
  outputModalities: string[];
  contextWindow: number;
  maxOutputTokens: number;
  source: CapabilitySource;
}

export interface VisionCapabilityOverride {
  providerId?: string;
  modelId: string;
  supportsVision: boolean;
  source?: "override" | "bundled" | "heuristic";
}

/**
 * Provider-level heuristic: determine vision support by provider + glob pattern.
 * Used INSTEAD of listing every model individually.
 */
export interface ProviderVisionPattern {
  providerId: string;
  /** Glob pattern: "*" = all, "gpt-*" = all GPT models, "deepseek-v4-*" = V4 series */
  modelGlob: string;
  supportsVision: boolean;
  /**
   * Priority: lower number = higher priority.
   * 0-9: Provider-wide defaults (e.g. "openai/*" → vision)
   * 10-19: Provider-specific exceptions (e.g. "deepseek/*" → text-only)
   * 20+: Model-specific exceptions (e.g. "deepseek/deepseek-v4-flash" → text-only)
   */
  priority: number;
}

export interface ModelsDevCacheEntry {
  fetchedAt: string;
  etag?: string;
  catalog: ModelsDevCatalog;
}

export interface ModelsDevCatalog {
  providers: Record<string, ModelsDevProvider>;
}

export interface ModelsDevProvider {
  models: Record<string, ModelsDevModel>;
}

export interface ModelsDevModel {
  id?: string;
  name?: string;
  family?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  modalities?: {
    input?: string[];
    output?: string[];
  };
  limit?: {
    context?: number;
    output?: number;
    input?: number;
  };
}

export type VisionToolName =
  | "analyze_image"
  | "ocr_image"
  | "analyze_ui_screenshot"
  | "compare_images";

export interface DetectedImage {
  path: string;
  source: "path" | "mention" | "markdown";
  start: number;
  end: number;
}

export interface PlannedVisionCall {
  tool: VisionToolName;
  imagePath: string;
  args: Record<string, unknown>;
  reason: string;
}

export interface ImageInterceptPlan {
  shouldIntercept: boolean;
  reason: string;
  capabilities: ModelCapabilities | null;
  images: DetectedImage[];
  plannedCalls: PlannedVisionCall[];
}

export type InterceptMode = "auto" | "text-only-only" | "always" | "never";

export interface ImageInterceptOptions {
  forceIntercept?: boolean;
  skipIntercept?: boolean;
  overrides?: VisionCapabilityOverride[];
  /**
   * Control intercept behavior:
   * - "auto" (default): use models.dev + bundled registry + overrides
   * - "text-only-only": ONLY intercept models in bundled text-only list
   * - "always": intercept regardless of model capabilities
   * - "never": never intercept
   */
  interceptMode?: InterceptMode;
}
