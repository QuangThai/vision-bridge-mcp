export interface EncodedImage {
  mimeType: string;
  base64: string;
}

export interface AnalyzeImageInput {
  image: EncodedImage;
  userPrompt: string;
  systemPrompt?: string;
}

export interface CompareImagesInput {
  before: EncodedImage;
  after: EncodedImage;
  userPrompt: string;
  systemPrompt?: string;
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
