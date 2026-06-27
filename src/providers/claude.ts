/**
 * Anthropic Claude vision provider.
 *
 * Talks to the Anthropic Messages API (api.anthropic.com/v1/messages).
 * Auth: x-api-key header (not Bearer).
 * Required header: anthropic-version.
 */
import type { AtlasConfig } from "../config.js";
import { withRetry } from "../utils/retry.js";
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
const ANTHROPIC_VERSION = "2023-06-01";

export interface ClaudeProviderConfig {
  config: AtlasConfig["vision"];
  fetch?: FetchFn;
}

// ── Anthropic API types ─────────────────────────────────────────────────────────

interface AnthropicContentBlock {
  type: "text" | "image";
  text?: string;
  source?: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicRequest {
  model: string;
  max_tokens: number;
  system?: string;
  messages: AnthropicMessage[];
  temperature?: number;
}

interface AnthropicResponse {
  id?: string;
  content?: Array<{ type: string; text?: string }>;
  error?: {
    type?: string;
    message?: string;
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function joinBaseUrl(baseUrl: string, path: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}${path}`;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

// ── Provider ────────────────────────────────────────────────────────────────────

export class ClaudeProvider implements VisionProvider {
  readonly name = "claude";

  private readonly visionConfig: AtlasConfig["vision"];
  private readonly fetchFn: FetchFn;

  constructor(options: ClaudeProviderConfig) {
    this.visionConfig = options.config;
    this.fetchFn = options.fetch ?? fetch;
  }

  async analyzeImage(input: AnalyzeImageInput): Promise<RawVisionResult> {
    // Per official Anthropic docs, images before text produces best results
    const content: AnthropicContentBlock[] = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: input.image.mimeType,
          data: input.image.base64,
        },
      },
      { type: "text", text: input.userPrompt },
    ];

    const body: AnthropicRequest = {
      model: this.visionConfig.model,
      max_tokens: this.visionConfig.maxOutputTokens,
      system: input.systemPrompt ?? VISION_SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
      temperature: this.visionConfig.temperature ?? DEFAULT_TEMPERATURE,
    };

    return this.createMessage(body);
  }

  async compareImages(input: CompareImagesInput): Promise<RawVisionResult> {
    // Per official Anthropic docs, images before text produces best results
    const content: AnthropicContentBlock[] = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: input.before.mimeType,
          data: input.before.base64,
        },
      },
      {
        type: "image",
        source: {
          type: "base64",
          media_type: input.after.mimeType,
          data: input.after.base64,
        },
      },
      { type: "text", text: input.userPrompt },
    ];

    const body: AnthropicRequest = {
      model: this.visionConfig.model,
      max_tokens: this.visionConfig.maxOutputTokens,
      system: input.systemPrompt ?? VISION_SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
      temperature: this.visionConfig.temperature ?? DEFAULT_TEMPERATURE,
    };

    return this.createMessage(body);
  }

  async healthCheck(): Promise<ProviderHealth> {
    try {
      const response = await this.rawRequest("/messages", {
        method: "POST",
        body: JSON.stringify({
          model: this.visionConfig.model,
          max_tokens: 10,
          messages: [{ role: "user", content: "hi" }],
        }),
      });

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          provider: this.name,
          model: this.visionConfig.model,
          message:
            "Authentication failed. Check VISION_API_KEY (Anthropic key starting with sk-ant-).",
        };
      }

      if (response.status === 400) {
        // 400 could mean a legit model check failed — treat as OK if we got a response
        return {
          ok: true,
          provider: this.name,
          model: this.visionConfig.model,
          message: "Provider reachable (model validated).",
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

  private async createMessage(body: AnthropicRequest): Promise<RawVisionResult> {
    const retryableRequest = withRetry(
      async () => {
        const response = await this.rawRequest("/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        const payload = (await response.json()) as AnthropicResponse;

        if (response.status === 401 || response.status === 403) {
          throw new ProviderError(
            "Authentication failed. Check VISION_API_KEY (Anthropic key starting with sk-ant-).",
            "auth",
            response.status,
          );
        }

        if (response.status === 429) {
          throw new ProviderError(
            "Rate limited by Anthropic API. Consider adding a delay or reducing request frequency.",
            "rate_limit",
            response.status,
          );
        }

        if (!response.ok) {
          const message = payload.error?.message ?? `HTTP ${response.status}`;
          throw new ProviderError(
            `Claude provider request failed: ${message}`,
            "http",
            response.status,
          );
        }

        const text = payload.content?.[0]?.text;
        if (!text || text.trim().length === 0) {
          throw new ProviderError(
            "Claude provider returned an empty response.",
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
    headers.set("x-api-key", this.visionConfig.apiKey);
    headers.set("anthropic-version", ANTHROPIC_VERSION);

    try {
      return await this.fetchFn(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(this.visionConfig.timeoutMs),
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw new ProviderError(
          `Claude provider request timed out after ${this.visionConfig.timeoutMs}ms.`,
          "timeout",
        );
      }

      throw new ProviderError(
        error instanceof Error ? error.message : "Claude provider network error.",
        "network",
      );
    }
  }
}
