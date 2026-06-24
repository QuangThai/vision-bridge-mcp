export interface EncodedImage {
  mimeType: string;
  base64: string;
}

export type ImageDetailLevel = "auto" | "low" | "high" | "original";

export interface AnalyzeImageInput {
  image: EncodedImage;
  userPrompt: string;
  systemPrompt?: string;
  detailLevel?: ImageDetailLevel;
}

export interface CompareImagesInput {
  before: EncodedImage;
  after: EncodedImage;
  userPrompt: string;
  systemPrompt?: string;
  detailLevel?: ImageDetailLevel;
}

export interface RawVisionResult {
  text: string;
  provider: string;
  model: string;
  raw: unknown;
}

export interface ProviderHealth {
  ok: boolean;
  provider: string;
  model: string;
  message?: string;
}

export interface VisionProvider {
  readonly name: string;
  analyzeImage(input: AnalyzeImageInput): Promise<RawVisionResult>;
  compareImages(input: CompareImagesInput): Promise<RawVisionResult>;
  healthCheck(): Promise<ProviderHealth>;
}

export type FetchFn = typeof fetch;

// Map Atlas detail_level ("brief" | "standard" | "detailed") to provider ImageDetailLevel
export function mapDetailLevel(atlasLevel: string): ImageDetailLevel | undefined {
  switch (atlasLevel) {
    case "brief":
      return "low";
    case "standard":
      return "high";
    case "detailed":
      return "original";
    default:
      return undefined;
  }
}

/**
 * Map detail level to Gemini media_resolution parameter.
 *
 * Gemini 3+ supports granular media resolution control:
 * - "low": up to 0.5x base tokens per image (fast, cheap)
 * - "high" (default): standard quality
 * - "original": maximum quality for fine text/small details
 * Not set when undefined (auto).
 */
export function mapDetailToMediaResolution(detailLevel?: string): string | undefined {
  switch (detailLevel) {
    case "low":
      return "low";
    case "high":
      return undefined; // default
    case "original":
      return "original";
    default:
      return undefined;
  }
}
