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

export interface OpenAIResponsesProviderConfig {
  config: AtlasConfig["vision"];
  fetch?: FetchFn;
}

// --- Response input item types ---

interface ResponseInputTextParam {
  type: "input_text";
  text: string;
}

interface ResponseInputImageParam {
  type: "input_image";
  image_url: string;
  detail?: ImageDetailLevel;
}

type ResponseInputContentParam = ResponseInputTextParam | ResponseInputImageParam;

interface EasyInputMessageParam {
  type: "message";
  role: "user" | "assistant" | "system" | "developer";
  content: string | ResponseInputContentParam[];
}

// --- Response types ---

interface ResponseOutputTextParam {
  type: "output_text";
  text: string;
  annotations?: unknown[];
}

interface ResponseOutputMessageParam {
  type: "message";
  role: "assistant";
  content: ResponseOutputTextParam[];
  status: "completed" | "in_progress" | "incomplete";
}

interface ResponseUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

interface CreateResponseRequest {
  model: string;
  input: EasyInputMessageParam[];
  instructions?: string;
  temperature?: number;
  max_output_tokens?: number;
  text?: {
    format?: { type: "text" | "json_object" };
  };
}

interface CreateResponseResponse {
  id: string;
  object: string;
  status: "completed" | "failed" | "in_progress";
  output: ResponseOutputMessageParam[];
  error?: {
    message?: string;
    code?: string;
  };
  usage?: ResponseUsage;
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

function buildContent(
  userPrompt: string,
  images: Array<{ mimeType: string; base64: string }>,
  detailLevel?: ImageDetailLevel,
): ResponseInputContentParam[] {
  const content: ResponseInputContentParam[] = [{ type: "input_text", text: userPrompt }];

  for (const image of images) {
    const imgParam: ResponseInputImageParam = {
      type: "input_image",
      image_url: toDataUrl(image),
    };
    if (detailLevel && detailLevel !== "auto") {
      imgParam.detail = detailLevel;
    }
    content.push(imgParam);
  }

  return content;
}

/**
 * OpenAI Responses API provider.
 *
 * Uses the new `/v1/responses` endpoint which supports vision natively.
 * Learn more: https://platform.openai.com/docs/api-reference/responses
 */
export class OpenAIResponsesProvider implements VisionProvider {
  readonly name = "openai-responses";

  private readonly visionConfig: AtlasConfig["vision"];
  private readonly fetchFn: FetchFn;

  constructor(options: OpenAIResponsesProviderConfig) {
    this.visionConfig = options.config;
    this.fetchFn = options.fetch ?? fetch;
  }

  async analyzeImage(input: AnalyzeImageInput): Promise<RawVisionResult> {
    const messages: EasyInputMessageParam[] = [
      {
        type: "message",
        role: "user",
        content: buildContent(input.userPrompt, [input.image], input.detailLevel),
      },
    ];

    return this.createResponse(messages, input.systemPrompt ?? VISION_SYSTEM_PROMPT);
  }

  async compareImages(input: CompareImagesInput): Promise<RawVisionResult> {
    const messages: EasyInputMessageParam[] = [
      {
        type: "message",
        role: "user",
        content: buildContent(input.userPrompt, [input.before, input.after], input.detailLevel),
      },
    ];

    return this.createResponse(messages, input.systemPrompt ?? VISION_SYSTEM_PROMPT);
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      // Use a minimal text-only response to verify connectivity
      const body: CreateResponseRequest = {
        model: this.visionConfig.model,
        input: [
          {
            type: "message",
            role: "user",
            content: "Respond with just: ok",
          },
        ],
        temperature: 0,
        max_output_tokens: 10,
      };

      const response = await this.rawRequest("/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

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

  private async createResponse(
    inputMessages: EasyInputMessageParam[],
    systemPrompt: string,
  ): Promise<RawVisionResult> {
    const body: CreateResponseRequest = {
      model: this.visionConfig.model,
      input: inputMessages,
      instructions: systemPrompt,
      temperature: this.visionConfig.temperature ?? DEFAULT_TEMPERATURE,
      max_output_tokens: this.visionConfig.maxOutputTokens,
      text: {
        format: { type: "json_object" },
      },
    };

    const retryableRequest = withRetry(
      async () => {
        const response = await this.rawRequest("/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        const payload = (await response.json()) as CreateResponseResponse;

        if (response.status === 401 || response.status === 403) {
          throw new ProviderError(
            "Authentication failed. Check VISION_API_KEY.",
            "auth",
            response.status,
          );
        }

        if (!response.ok || payload.status === "failed") {
          const message = payload.error?.message ?? `HTTP ${response.status}`;
          throw new ProviderError(
            `Vision provider request failed: ${message}`,
            "http",
            response.status,
          );
        }

        // Extract text from the first output message
        const outputMessage = payload.output.find((o) => o.type === "message");
        const text = outputMessage?.content
          ?.filter((c) => c.type === "output_text")
          .map((c) => c.text)
          .join("\n");

        if (!text || text.trim().length === 0) {
          throw new ProviderError(
            "Vision provider returned an empty response.",
            "invalid_response",
          );
        }

        return {
          text,
          provider: this.name,
          model: this.visionConfig.model,
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
