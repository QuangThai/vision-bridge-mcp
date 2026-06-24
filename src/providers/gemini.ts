import type { AtlasConfig } from "../config.js";
import { ProviderError } from "./errors.js";
import { VISION_SYSTEM_PROMPT } from "./prompts.js";
import type {
  AnalyzeImageInput,
  CompareImagesInput,
  FetchFn,
  ProviderHealth,
  RawVisionResult,
  VisionProvider,
} from "./types.js";

const DEFAULT_TEMPERATURE = 0.1;

export interface GeminiProviderConfig {
  config: AtlasConfig["vision"];
  fetch?: FetchFn;
}

interface GeminiContentPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiContentPart[];
}

interface GeminiRequest {
  contents: GeminiContent[];
  systemInstruction?: {
    parts: [{ text: string }];
  };
  generationConfig: {
    temperature: number;
    maxOutputTokens: number;
  };
}

interface GeminiCandidate {
  content?: {
    parts?: Array<{ text?: string }>;
  };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  error?: {
    message?: string;
    code?: number;
  };
}

function buildGeminiUrl(baseUrl: string, model: string): string {
  // Default to Google AI if no base URL override
  if (!baseUrl || baseUrl === "https://api.openai.com/v1") {
    baseUrl = "https://generativelanguage.googleapis.com/v1beta";
  }
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/models/${model}:generateContent`;
}

export class GeminiProvider implements VisionProvider {
  readonly name = "gemini";

  private readonly visionConfig: AtlasConfig["vision"];
  private readonly fetchFn: FetchFn;

  constructor(options: GeminiProviderConfig) {
    this.visionConfig = options.config;
    this.fetchFn = options.fetch ?? fetch;
  }

  async analyzeImage(input: AnalyzeImageInput): Promise<RawVisionResult> {
    const parts: GeminiContentPart[] = [
      { text: input.userPrompt },
      {
        inlineData: {
          mimeType: input.image.mimeType,
          data: input.image.base64,
        },
      },
    ];

    const contents: GeminiContent[] = [
      {
        role: "user",
        parts,
      },
    ];

    const body: GeminiRequest = {
      contents,
      systemInstruction: {
        parts: [{ text: input.systemPrompt ?? VISION_SYSTEM_PROMPT }],
      },
      generationConfig: {
        temperature: DEFAULT_TEMPERATURE,
        maxOutputTokens: this.visionConfig.maxOutputTokens,
      },
    };

    return this.generateContent(body);
  }

  async compareImages(input: CompareImagesInput): Promise<RawVisionResult> {
    const parts: GeminiContentPart[] = [
      { text: input.userPrompt },
      {
        inlineData: {
          mimeType: input.before.mimeType,
          data: input.before.base64,
        },
      },
      {
        inlineData: {
          mimeType: input.after.mimeType,
          data: input.after.base64,
        },
      },
    ];

    const contents: GeminiContent[] = [
      {
        role: "user",
        parts,
      },
    ];

    const body: GeminiRequest = {
      contents,
      systemInstruction: {
        parts: [{ text: input.systemPrompt ?? VISION_SYSTEM_PROMPT }],
      },
      generationConfig: {
        temperature: DEFAULT_TEMPERATURE,
        maxOutputTokens: this.visionConfig.maxOutputTokens,
      },
    };

    return this.generateContent(body);
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      // Simple model list fetch to verify connectivity
      const url = buildGeminiUrl(this.visionConfig.baseUrl, this.visionConfig.model);
      const response = await this.fetchFn(url, {
        method: "GET",
        headers: {
          "x-goog-api-key": this.visionConfig.apiKey,
        },
      });

      if (response.status === 403 || response.status === 401) {
        return {
          ok: false,
          provider: this.name,
          model: this.visionConfig.model,
          message: "Authentication failed. Check VISION_API_KEY.",
        };
      }

      if (!response.ok) {
        return {
          ok: false,
          provider: this.name,
          model: this.visionConfig.model,
          message: `Health check failed with HTTP ${response.status}.`,
        };
      }

      return {
        ok: true,
        provider: this.name,
        model: this.visionConfig.model,
        message: "Provider reachable.",
      };
    } catch (error) {
      return {
        ok: false,
        provider: this.name,
        model: this.visionConfig.model,
        message: error instanceof Error ? error.message : "Unknown health check error",
      };
    }
  }

  private async generateContent(body: GeminiRequest): Promise<RawVisionResult> {
    const url = buildGeminiUrl(this.visionConfig.baseUrl, this.visionConfig.model);

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.visionConfig.apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.visionConfig.timeoutMs),
    });

    const payload = (await response.json()) as GeminiResponse;

    if (response.status === 403 || response.status === 401) {
      throw new ProviderError(
        "Authentication failed. Check VISION_API_KEY.",
        "auth",
        response.status,
      );
    }

    if (!response.ok) {
      const message = payload.error?.message ?? `HTTP ${response.status}`;
      throw new ProviderError(`Gemini request failed: ${message}`, "http", response.status);
    }

    const text = payload.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .filter(Boolean)
      .join("\n");

    if (!text || text.trim().length === 0) {
      throw new ProviderError("Gemini returned an empty response.", "invalid_response");
    }

    return {
      text,
      provider: this.name,
      model: this.visionConfig.model,
      raw: payload,
    };
  }
}
