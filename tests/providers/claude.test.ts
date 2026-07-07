import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { ClaudeProvider } from "../../src/providers/claude.js";
import type { ProviderError } from "../../src/providers/errors.js";
import type { FetchFn, RawVisionResult } from "../../src/providers/types.js";

const testEnv = {
  VISION_API_KEY: "sk-ant-test-key",
  VISION_BASE_URL: "https://api.anthropic.com/v1",
  VISION_MODEL: "claude-sonnet-4-20250514",
  VISION_RETRY_MAX: "0",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createMockFetch(
  handler: (url: string, init: RequestInit) => Response | Promise<Response>,
): FetchFn {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return handler(url, init ?? {});
  }) as FetchFn;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ClaudeProvider", () => {
  it("sends analyze_image request with base64 image and system prompt", async () => {
    const fetch = createMockFetch((url, init) => {
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      expect(init.method).toBe("POST");

      const headers = new Headers(init.headers);
      expect(headers.get("x-api-key")).toBe("sk-ant-test-key");
      expect(headers.get("anthropic-version")).toBe("2023-06-01");

      const body = JSON.parse(String(init.body)) as {
        model: string;
        max_tokens: number;
        system?: string;
        messages: Array<{ role: string; content: unknown }>;
        temperature: number;
      };

      expect(body.model).toBe("claude-sonnet-4-20250514");
      expect(body.max_tokens).toBe(4_000);
      expect(body.system).toBeTruthy();
      expect(body.temperature).toBe(0.1);

      const content = body.messages[0]?.content as Array<{
        type: string;
        source?: { type: string; media_type: string; data: string };
      }>;

      expect(body.messages[0]?.role).toBe("user");
      expect(Array.isArray(content)).toBe(true);
      // Official Anthropic docs: images before text produces best results
      expect(content[0]?.type).toBe("image");
      expect(content[0]?.source?.type).toBe("base64");
      expect(content[0]?.source?.media_type).toBe("image/png");
      expect(content[0]?.source?.data).toBe("abc123");
      expect(content[1]?.type).toBe("text");
      expect(content[1]?.text).toBe("Describe this screenshot.");

      return jsonResponse({
        id: "msg_abc123",
        content: [
          { type: "text", text: "The image shows a login screen with email and password fields." },
        ],
        model: "claude-sonnet-4-20250514",
        role: "assistant",
        stop_reason: "end_turn",
      });
    });

    const config = loadConfig(testEnv);
    const provider = new ClaudeProvider({ config: config.vision, fetch });

    const result = await provider.analyzeImage({
      image: { mimeType: "image/png", base64: "abc123" },
      userPrompt: "Describe this screenshot.",
    });

    expect(result.text).toBe("The image shows a login screen with email and password fields.");
    expect(result.provider).toBe("claude");
    expect(result.model).toBe("claude-sonnet-4-20250514");
  });

  it("sends compare_images request with before/after images", async () => {
    const fetch = createMockFetch((url, init) => {
      const body = JSON.parse(String(init.body)) as {
        messages: Array<{ content: Array<{ type: string }> }>;
      };
      const content = body.messages[0]?.content as Array<{ type: string }>;

      // Per official Anthropic docs: images before text
      expect(content).toHaveLength(3);
      expect(content[0]?.type).toBe("image");
      expect(content[1]?.type).toBe("image");
      expect(content[2]?.type).toBe("text");

      return jsonResponse({
        id: "msg_xyz",
        content: [{ type: "text", text: "Differences found: header color changed." }],
        model: "claude-sonnet-4-20250514",
      });
    });

    const config = loadConfig(testEnv);
    const provider = new ClaudeProvider({ config: config.vision, fetch });

    const result = await provider.compareImages({
      before: { mimeType: "image/png", base64: "before123" },
      after: { mimeType: "image/png", base64: "after456" },
      userPrompt: "Compare these screenshots.",
    });

    expect(result.text).toContain("Differences found");
    expect(result.provider).toBe("claude");
  });

  it("throws ProviderError on auth failure (401)", async () => {
    const fetch = createMockFetch(() => {
      return jsonResponse(
        { error: { type: "authentication_error", message: "Invalid API key" } },
        401,
      );
    });

    const config = loadConfig(testEnv);
    const provider = new ClaudeProvider({ config: config.vision, fetch });

    await expect(
      provider.analyzeImage({
        image: { mimeType: "image/png", base64: "abc" },
        userPrompt: "test",
      }),
    ).rejects.toMatchObject({
      name: "ProviderError",
      code: "auth",
    });
  });

  it("throws ProviderError on rate limit (429)", async () => {
    const fetch = createMockFetch(() => {
      return jsonResponse(
        { error: { type: "rate_limit_error", message: "Too many requests" } },
        429,
      );
    });

    const config = loadConfig(testEnv);
    const provider = new ClaudeProvider({ config: config.vision, fetch });

    await expect(
      provider.analyzeImage({
        image: { mimeType: "image/png", base64: "abc" },
        userPrompt: "test",
      }),
    ).rejects.toMatchObject({
      name: "ProviderError",
      code: "rate_limit",
    });
  });

  it("throws ProviderError on HTTP error (500)", async () => {
    const fetch = createMockFetch(() => {
      return jsonResponse(
        { error: { type: "server_error", message: "Internal server error" } },
        500,
      );
    });

    const config = loadConfig(testEnv);
    const provider = new ClaudeProvider({ config: config.vision, fetch });

    await expect(
      provider.analyzeImage({
        image: { mimeType: "image/png", base64: "abc" },
        userPrompt: "test",
      }),
    ).rejects.toMatchObject({
      name: "ProviderError",
      code: "http",
    });
  });

  it("healthCheck returns ok on 400 (model validated)", async () => {
    const fetch = createMockFetch(() => {
      return jsonResponse(
        { error: { type: "invalid_request_error", message: "too few messages" } },
        400,
      );
    });

    const config = loadConfig(testEnv);
    const provider = new ClaudeProvider({ config: config.vision, fetch });

    const health = await provider.healthCheck();
    expect(health.ok).toBe(true);
  });

  it("healthCheck returns not ok on auth failure", async () => {
    const fetch = createMockFetch(() => {
      return jsonResponse({ error: { type: "authentication_error", message: "Invalid key" } }, 401);
    });

    const config = loadConfig(testEnv);
    const provider = new ClaudeProvider({ config: config.vision, fetch });

    const health = await provider.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.message).toContain("Authentication failed");
  });

  it("sets required Anthropic headers", async () => {
    const fetch = createMockFetch((url, init) => {
      const headers = new Headers(init.headers);
      expect(headers.get("x-api-key")).toBe("sk-ant-test-key");
      expect(headers.get("anthropic-version")).toBe("2023-06-01");
      expect(headers.get("Content-Type")).toBe("application/json");

      return jsonResponse({
        content: [{ type: "text", text: "ok" }],
      });
    });

    const config = loadConfig(testEnv);
    const provider = new ClaudeProvider({ config: config.vision, fetch });

    const result = await provider.analyzeImage({
      image: { mimeType: "image/jpeg", base64: "def456" },
      userPrompt: "test",
    });

    expect(result.text).toBe("ok");
  });

  it("uses custom baseUrl from config", async () => {
    const customEnv = {
      ...testEnv,
      VISION_BASE_URL: "https://custom.anthropic.example.com/v1",
    };

    const fetch = createMockFetch((url) => {
      expect(url).toBe("https://custom.anthropic.example.com/v1/messages");
      return jsonResponse({
        content: [{ type: "text", text: "works with custom url" }],
      });
    });

    const config = loadConfig(customEnv);
    const provider = new ClaudeProvider({ config: config.vision, fetch });

    const result = await provider.analyzeImage({
      image: { mimeType: "image/png", base64: "abc" },
      userPrompt: "test",
    });

    expect(result.text).toBe("works with custom url");
  });

  it("handles empty response from provider", async () => {
    const fetch = createMockFetch(() => {
      return jsonResponse({
        id: "msg_empty",
        content: [],
      });
    });

    const config = loadConfig(testEnv);
    const provider = new ClaudeProvider({ config: config.vision, fetch });

    await expect(
      provider.analyzeImage({
        image: { mimeType: "image/png", base64: "abc" },
        userPrompt: "test",
      }),
    ).rejects.toMatchObject({
      name: "ProviderError",
      code: "invalid_response",
    });
  });

  it("uses the per-call model override instead of the configured model", async () => {
    const fetch = createMockFetch((_url, init) => {
      const body = JSON.parse(String(init.body)) as { model: string };
      expect(body.model).toBe("claude-opus-4");

      return jsonResponse({
        content: [{ type: "text", text: "ok" }],
      });
    });

    const config = loadConfig(testEnv);
    const provider = new ClaudeProvider({ config: config.vision, fetch });

    const result = await provider.analyzeImage({
      image: { mimeType: "image/png", base64: "abc" },
      userPrompt: "test",
      modelOverride: "claude-opus-4",
    });

    // The result reports the actually-used model, not the configured default
    expect(result.model).toBe("claude-opus-4");
  });
});
