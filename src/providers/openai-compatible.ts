import type { AtlasConfig } from "../config.js";
import { withRetry } from "../utils/retry.js";
import { ProviderError } from "./errors.js";
import { VISION_SYSTEM_PROMPT } from "./prompts.js";
import type {
  AnalyzeImageInput,
  CompareImagesInput,
  FetchFn,
  ImageDetailLevel,
  ProviderHealth,
  RawVisionResult,
  VisionProvider,
} from "./types.js";

const DEFAULT_TEMPERATURE = 0.1;

export interface OpenAICompatibleProviderConfig {
  config: AtlasConfig["vision"];
  fetch?: FetchFn;
}

interface ChatCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatCompletionContentPart[];
}

interface ChatCompletionContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
    detail?: ImageDetailLevel;
  };
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatCompletionMessage[];
  temperature: number;
  max_tokens: number;
  response_format?: { type: "text" | "json_object" };
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

function joinBaseUrl(baseUrl: string, path: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}${path}`;
}

function toDataUrl(image: { mimeType: string; base64: string }): string {
  return `data:${image.mimeType};base64,${image.base64}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function buildImageUrl(
  image: { mimeType: string; base64: string },
  detailLevel?: ImageDetailLevel,
): { url: string; detail?: ImageDetailLevel } {
  const url: { url: string; detail?: ImageDetailLevel } = {
    url: toDataUrl(image),
  };
  if (detailLevel && detailLevel !== "auto") {
    url.detail = detailLevel;
  }
  return url;
}

export class OpenAICompatibleProvider implements VisionProvider {
  readonly name = "openai-compatible";

  private readonly visionConfig: AtlasConfig["vision"];
  private readonly fetchFn: FetchFn;

  constructor(options: OpenAICompatibleProviderConfig) {
    this.visionConfig = options.config;
    this.fetchFn = options.fetch ?? fetch;
  }

  async analyzeImage(input: AnalyzeImageInput): Promise<RawVisionResult> {
    const messages: ChatCompletionMessage[] = [
      {
        role: "system",
        content: input.systemPrompt ?? VISION_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          { type: "text", text: input.userPrompt },
          {
            type: "image_url",
            image_url: buildImageUrl(input.image, input.detailLevel),
          },
        ],
      },
    ];

    return this.createChatCompletion(messages, input.modelOverride);
  }

  async compareImages(input: CompareImagesInput): Promise<RawVisionResult> {
    const messages: ChatCompletionMessage[] = [
      {
        role: "system",
        content: input.systemPrompt ?? VISION_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: [
          { type: "text", text: input.userPrompt },
          {
            type: "image_url",
            image_url: buildImageUrl(input.before, input.detailLevel),
          },
          {
            type: "image_url",
            image_url: buildImageUrl(input.after, input.detailLevel),
          },
        ],
      },
    ];

    return this.createChatCompletion(messages, input.modelOverride);
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const response = await this.rawRequest("/models", { method: "GET" });

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          provider: this.name,
          model: this.visionConfig.model,
          message: "Authentication failed. Check VISION_API_KEY.",
        };
      }

      if (!response.ok) {
        const body = await response.text();
        return {
          ok: false,
          provider: this.name,
          model: this.visionConfig.model,
          message: `Health check failed with HTTP ${response.status}: ${body}`,
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

  private async createChatCompletion(
    messages: ChatCompletionMessage[],
    modelOverride?: string,
  ): Promise<RawVisionResult> {
    const model = modelOverride?.trim() || this.visionConfig.model;
    const body: ChatCompletionRequest = {
      model,
      messages,
      temperature: this.visionConfig.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: this.visionConfig.maxOutputTokens,
      response_format: { type: "json_object" },
    };

    const retryableRequest = withRetry(
      async () => {
        const response = await this.rawRequest("/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        const payload = (await response.json()) as ChatCompletionResponse;

        if (response.status === 401 || response.status === 403) {
          throw new ProviderError(
            "Authentication failed. Check VISION_API_KEY.",
            "auth",
            response.status,
          );
        }

        if (!response.ok) {
          const message = payload.error?.message ?? `HTTP ${response.status}`;
          throw new ProviderError(
            `Vision provider request failed: ${message}`,
            "http",
            response.status,
          );
        }

        const text = payload.choices?.[0]?.message?.content;
        if (!text || text.trim().length === 0) {
          throw new ProviderError(
            "Vision provider returned an empty response.",
            "invalid_response",
          );
        }

        return {
          text,
          provider: this.name,
          model,
          raw: payload,
        };
      },
      { maxRetries: this.visionConfig.retryMax },
    );

    return retryableRequest();
  }

  private async rawRequest(path: string, init: RequestInit): Promise<Response> {
    const url = joinBaseUrl(this.visionConfig.baseUrl, path);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.visionConfig.apiKey}`);

    try {
      return await this.fetchFn(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(this.visionConfig.timeoutMs),
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new ProviderError(
          `Vision provider request timed out after ${this.visionConfig.timeoutMs}ms.`,
          "timeout",
        );
      }

      throw new ProviderError(
        error instanceof Error ? error.message : "Vision provider network error.",
        "network",
      );
    }
  }
}
