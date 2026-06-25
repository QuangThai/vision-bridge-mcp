import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import type { ProviderError } from "../../src/providers/errors.js";
import { createVisionProvider } from "../../src/providers/index.js";
import { OpenAICompatibleProvider } from "../../src/providers/openai-compatible.js";
import type { FetchFn } from "../../src/providers/types.js";

const testEnv = {
  VISION_API_KEY: "sk-test",
  VISION_BASE_URL: "https://api.example.com/v1",
  VISION_MODEL: "gpt-4o-mini",
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

describe("OpenAICompatibleProvider", () => {
  it("sends analyze_image request with base64 image and system prompt", async () => {
    const fetch = createMockFetch((url, init) => {
      expect(url).toBe("https://api.example.com/v1/chat/completions");
      expect(init.method).toBe("POST");

      const headers = new Headers(init.headers);
      expect(headers.get("Authorization")).toBe("Bearer sk-test");

      const body = JSON.parse(String(init.body)) as {
        model: string;
        temperature: number;
        max_tokens: number;
        messages: Array<{ role: string; content: unknown }>;
      };

      expect(body.model).toBe("gpt-4o-mini");
      expect(body.temperature).toBe(0.1);
      expect(body.max_tokens).toBe(4_000);
      expect(body.messages[0]?.role).toBe("system");
      expect(body.messages[1]?.role).toBe("user");

      const userContent = body.messages[1]?.content as Array<{
        type: string;
        image_url?: { url: string };
      }>;
      expect(userContent[1]?.type).toBe("image_url");
      expect(userContent[1]?.image_url?.url).toBe("data:image/png;base64,abc123");

      return jsonResponse({
        choices: [{ message: { content: "summary text" } }],
      });
    });

    const config = loadConfig(testEnv);
    const provider = new OpenAICompatibleProvider({ config: config.vision, fetch });

    const result = await provider.analyzeImage({
      image: { mimeType: "image/png", base64: "abc123" },
      userPrompt: "Describe this screenshot.",
    });

    expect(result.text).toBe("summary text");
    expect(result.provider).toBe("openai-compatible");
    expect(result.model).toBe("gpt-4o-mini");
  });

  it("sends compare_images request with two images", async () => {
    const fetch = createMockFetch((_url, init) => {
      const body = JSON.parse(String(init.body)) as {
        messages: Array<{ content: Array<{ type: string }> }>;
      };
      const images = body.messages[1]?.content.filter((part) => part.type === "image_url");
      expect(images).toHaveLength(2);

      return jsonResponse({
        choices: [{ message: { content: "diff summary" } }],
      });
    });

    const config = loadConfig(testEnv);
    const provider = new OpenAICompatibleProvider({ config: config.vision, fetch });

    const result = await provider.compareImages({
      before: { mimeType: "image/png", base64: "before" },
      after: { mimeType: "image/png", base64: "after" },
      userPrompt: "Compare these screenshots.",
    });

    expect(result.text).toBe("diff summary");
  });

  it("maps auth errors", async () => {
    const fetch = createMockFetch(() => jsonResponse({ error: { message: "invalid key" } }, 401));
    const config = loadConfig(testEnv);
    const provider = new OpenAICompatibleProvider({ config: config.vision, fetch });

    await expect(
      provider.analyzeImage({
        image: { mimeType: "image/png", base64: "abc" },
        userPrompt: "test",
      }),
    ).rejects.toMatchObject({
      name: "ProviderError",
      code: "auth",
      statusCode: 401,
    } satisfies Partial<ProviderError>);
  });

  it("maps timeout errors", async () => {
    const fetch = vi.fn(async () => {
      const error = new Error("The operation was aborted");
      error.name = "AbortError";
      throw error;
    }) as FetchFn;

    const config = loadConfig({ ...testEnv, VISION_TIMEOUT_MS: "1000" });
    const provider = new OpenAICompatibleProvider({ config: config.vision, fetch });

    await expect(
      provider.analyzeImage({
        image: { mimeType: "image/png", base64: "abc" },
        userPrompt: "test",
      }),
    ).rejects.toMatchObject({
      code: "timeout",
    });
  });

  it("healthCheck reports connectivity", async () => {
    const fetch = createMockFetch((url, init) => {
      expect(url).toBe("https://api.example.com/v1/models");
      expect(init.method).toBe("GET");
      return jsonResponse({ data: [] });
    });

    const config = loadConfig(testEnv);
    const provider = new OpenAICompatibleProvider({ config: config.vision, fetch });
    const health = await provider.healthCheck();

    expect(health.ok).toBe(true);
    expect(health.provider).toBe("openai-compatible");
  });
});

describe("createVisionProvider", () => {
  it("selects openai-compatible provider from config", async () => {
    const fetch = createMockFetch(() =>
      jsonResponse({
        choices: [{ message: { content: "ok" } }],
      }),
    );

    const provider = createVisionProvider(
      loadConfig({ ...testEnv, ATLAS_DISABLE_CACHE: "true", ATLAS_TRACK_COSTS: "false" }),
      { fetch },
    );
    expect(provider.name).toBe("openai-compatible");

    const result = await provider.analyzeImage({
      image: { mimeType: "image/png", base64: "abc" },
      userPrompt: "test",
    });

    expect(result.text).toBe("ok");
  });

  it("requires API key before creating provider", () => {
    expect(() => createVisionProvider(loadConfig({ VISION_API_KEY: "" }))).toThrow(
      /VISION_API_KEY/,
    );
  });
});
