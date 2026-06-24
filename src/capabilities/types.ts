export type CapabilitySource = "models.dev" | "override" | "unknown";

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
  source?: "override";
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

export interface ImageInterceptOptions {
  forceIntercept?: boolean;
  skipIntercept?: boolean;
  overrides?: VisionCapabilityOverride[];
}
