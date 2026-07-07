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
  /** Whether this result was served from cache. */
  _cached?: boolean;
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

// Map Atlas detail_level ("brief" | "standard" | "detailed") to provider ImageDetailLevel.
// This is shared across ALL providers (openai-compatible, openai-responses, gemini,
// claude) — it must stay in the generic "auto|low|high|original" vocabulary that every
// provider understands. Volcengine's Responses-API-compatible endpoint rejects
// "original" (it wants "xhigh" instead), but that's a wire-format quirk of ONE
// provider — see `openai-responses.ts`'s own detail remapping, scoped to just that
// provider, instead of leaking "xhigh" into every provider's request here.
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
 * Check if a Gemini model supports media_resolution (Gemini 3+ only).
 */
export function supportsMediaResolution(model: string): boolean {
  return model.startsWith("gemini-3");
}

/**
 * Map detail level to Gemini media_resolution parameter.
 *
 * media_resolution is only supported on Gemini 3+. For older models
 * (gemini-2.x, gemini-1.x) this function always returns undefined.
 *
 * Gemini 3+ supports granular media resolution control:
 * - MEDIA_RESOLUTION_LOW: up to 0.5x base tokens per image (fast, cheap)
 * - MEDIA_RESOLUTION_HIGH (default): standard quality
 * - MEDIA_RESOLUTION_ORIGINAL: maximum quality for fine text/small details
 * Not set when undefined (auto).
 */
export function mapDetailToMediaResolution(
  detailLevel?: string,
  model?: string,
): string | undefined {
  // media_resolution is only supported on Gemini 3+
  if (model && !supportsMediaResolution(model)) {
    return undefined;
  }
  switch (detailLevel) {
    case "low":
      return "MEDIA_RESOLUTION_LOW";
    case "high":
      return undefined; // default
    case "original":
      return "MEDIA_RESOLUTION_ORIGINAL";
    default:
      return undefined;
  }
}
