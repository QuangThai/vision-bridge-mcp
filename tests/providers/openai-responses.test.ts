import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import type { ProviderError } from "../../src/providers/errors.js";
import { OpenAIResponsesProvider } from "../../src/providers/openai-responses.js";
import type { FetchFn } from "../../src/providers/types.js";

const testEnv = {
  VISION_API_KEY: "sk-test",
  VISION_BASE_URL: "https://api.openai.com/v1",
  VISION_MODEL: "gpt-4o",
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

describe("OpenAIResponsesProvider", () => {
  it("sends analyze_image request via /responses endpoint", async () => {
    const fetch = createMockFetch((url, init) => {
      expect(url).toBe("https://api.openai.com/v1/responses");
      expect(init.method).toBe("POST");

      const headers = new Headers(init.headers);
      expect(headers.get("Authorization")).toBe("Bearer sk-test");

      const body = JSON.parse(String(init.body)) as {
        model: string;
        input: Array<{ type: string; role: string; content: unknown }>;
        instructions: string;
        temperature: number;
        thinking: { type: string };
        store: boolean;
        text: { format: { type: string } };
      };

      expect(body.model).toBe("gpt-4o");
      expect(body.temperature).toBe(0.1);
      expect(body.thinking).toEqual({ type: "disabled" });
      expect(body.store).toBe(true);
      expect(body.instructions).toBeTruthy();
      expect(body.text.format.type).toBe("json_object");

      // Check input message
      expect(body.input[0]?.type).toBe("message");
      expect(body.input[0]?.role).toBe("user");
      const content = body.input[0]?.content as Array<{ type: string; image_url?: string }>;

      // First item should be the text prompt
      expect(content[0]?.type).toBe("input_text");
      expect((content[0] as { text: string }).text).toBe("Describe this screenshot.");

      // Second item should be the image
      expect(content[1]?.type).toBe("input_image");
      expect((content[1] as { image_url: string }).image_url).toBe("data:image/png;base64,abc123");

      return jsonResponse({
        id: "resp_test",
        object: "response",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "summary text", annotations: [] }],
            status: "completed",
          },
        ],
        usage: { input_tokens: 50, output_tokens: 10, total_tokens: 60 },
      });
    });

    const config = loadConfig(testEnv);
    const provider = new OpenAIResponsesProvider({ config: config.vision, fetch });

    const result = await provider.analyzeImage({
      image: { mimeType: "image/png", base64: "abc123" },
      userPrompt: "Describe this screenshot.",
    });

    expect(result.text).toBe("summary text");
    expect(result.provider).toBe("openai-responses");
    expect(result.model).toBe("gpt-4o");
  });

  it("sends compare_images request with two images", async () => {
    const fetch = createMockFetch((_url, init) => {
      const body = JSON.parse(String(init.body)) as {
        input: Array<{ content: Array<{ type: string }> }>;
      };
      const images = body.input[0]?.content.filter((part) => part.type === "input_image");
      expect(images).toHaveLength(2);

      return jsonResponse({
        id: "resp_test",
        object: "response",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "diff summary", annotations: [] }],
            status: "completed",
          },
        ],
      });
    });

    const config = loadConfig(testEnv);
    const provider = new OpenAIResponsesProvider({ config: config.vision, fetch });

    const result = await provider.compareImages({
      before: { mimeType: "image/png", base64: "before" },
      after: { mimeType: "image/png", base64: "after" },
      userPrompt: "Compare these screenshots.",
    });

    expect(result.text).toBe("diff summary");
  });

  it("handles failed response status", async () => {
    const fetch = createMockFetch(() =>
      jsonResponse(
        {
          id: "resp_test",
          object: "response",
          status: "failed",
          error: { message: "Model overloaded", code: "server_error" },
          output: [],
        },
        200, // API returns 200 even for failures, status is in body
      ),
    );

    const config = loadConfig(testEnv);
    const provider = new OpenAIResponsesProvider({ config: config.vision, fetch });

    await expect(
      provider.analyzeImage({
        image: { mimeType: "image/png", base64: "abc" },
        userPrompt: "test",
      }),
    ).rejects.toMatchObject({
      name: "ProviderError",
    });
  });

  it("maps auth errors", async () => {
    const fetch = createMockFetch(() => jsonResponse({ error: { message: "invalid key" } }, 401));

    const config = loadConfig(testEnv);
    const provider = new OpenAIResponsesProvider({ config: config.vision, fetch });

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
    const provider = new OpenAIResponsesProvider({ config: config.vision, fetch });

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
      // Health check sends a minimal text-only response request
      expect(url).toBe("https://api.openai.com/v1/responses");
      expect(init.method).toBe("POST");

      const body = JSON.parse(String(init.body)) as { input: Array<unknown> };
      expect(body.input).toHaveLength(1);

      return jsonResponse({
        id: "resp_health",
        object: "response",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "ok" }],
            status: "completed",
          },
        ],
      });
    });

    const config = loadConfig(testEnv);
    const provider = new OpenAIResponsesProvider({ config: config.vision, fetch });
    const health = await provider.healthCheck();

    expect(health.ok).toBe(true);
    expect(health.provider).toBe("openai-responses");
  });

  it("healthCheck reports auth failure", async () => {
    const fetch = createMockFetch(() => jsonResponse({ error: { message: "unauthorized" } }, 401));

    const config = loadConfig(testEnv);
    const provider = new OpenAIResponsesProvider({ config: config.vision, fetch });
    const health = await provider.healthCheck();

    expect(health.ok).toBe(false);
    expect(health.message).toContain("Authentication failed");
  });
});
