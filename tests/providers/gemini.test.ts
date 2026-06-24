import { describe, expect, it, vi } from "vitest";
import { createVisionProvider } from "../../src/providers/index.js";
import { GeminiProvider } from "../../src/providers/gemini.js";
import { loadConfig } from "../../src/config.js";

function mockFetch(response: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(response),
  }) as unknown as typeof fetch;
}

function mockFetchError(
  status: number,
  body: unknown = { error: { message: `HTTP ${status}` } },
): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  }) as unknown as typeof fetch;
}

const visionConfig = {
  VISION_PROVIDER: "gemini" as const,
  VISION_API_KEY: "test-key",
  VISION_BASE_URL: "https://generativelanguage.googleapis.com/v1beta",
  VISION_MODEL: "gemini-2.0-flash",
  VISION_TIMEOUT_MS: "60000",
  VISION_MAX_IMAGE_MB: "10",
  VISION_MAX_OUTPUT_TOKENS: "4000",
  ATLAS_ALLOWED_DIRS: ".",
  ATLAS_STORE_HISTORY: "false",
  ATLAS_LOG_LEVEL: "info",
  ATLAS_LOG_IMAGE_CONTENT: "false",
  ATLAS_REDACT_SECRETS: "true",
  ATLAS_DEFAULT_DETAIL_LEVEL: "standard",
} as const;

describe("GeminiProvider", () => {
  it("constructs with config", () => {
    const provider = new GeminiProvider({
      config: loadConfig(visionConfig).vision,
      fetch: mockFetch({}),
    });
    expect(provider.name).toBe("gemini");
  });

  it("analyzeImage returns parsed result from Gemini", async () => {
    const fetch = mockFetch({
      candidates: [
        {
          content: {
            parts: [{ text: "The image shows a login form with email and password fields." }],
          },
          finishReason: "STOP",
        },
      ],
    });

    const provider = new GeminiProvider({
      config: loadConfig(visionConfig).vision,
      fetch,
    });

    const result = await provider.analyzeImage({
      image: { mimeType: "image/png", base64: "fakebase64" },
      userPrompt: "Describe this image.",
    });

    expect(result.text).toContain("login form");
    expect(result.provider).toBe("gemini");
    expect(result.model).toBe("gemini-2.0-flash");

    // Verify request format
    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.contents[0].role).toBe("user");
    expect(body.contents[0].parts[0].text).toBe("Describe this image.");
    expect(body.contents[0].parts[1].inlineData.mimeType).toBe("image/png");
    expect(body.systemInstruction.parts[0].text).toBeTruthy();
  });

  it("compareImages sends both images", async () => {
    const fetch = mockFetch({
      candidates: [
        {
          content: {
            parts: [{ text: "The layout shifted slightly." }],
          },
          finishReason: "STOP",
        },
      ],
    });

    const provider = new GeminiProvider({
      config: loadConfig(visionConfig).vision,
      fetch,
    });

    const result = await provider.compareImages({
      before: { mimeType: "image/png", base64: "before" },
      after: { mimeType: "image/png", base64: "after" },
      userPrompt: "Compare these images.",
    });

    expect(result.text).toContain("layout shifted");
    expect(result.provider).toBe("gemini");

    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.contents[0].parts).toHaveLength(3); // text + before + after
  });

  it("throws on empty response", async () => {
    const fetch = mockFetch({ candidates: [] });

    const provider = new GeminiProvider({
      config: loadConfig(visionConfig).vision,
      fetch,
    });

    await expect(
      provider.analyzeImage({
        image: { mimeType: "image/png", base64: "fake" },
        userPrompt: "Describe.",
      }),
    ).rejects.toThrow("empty response");
  });

  it("throws on auth error", async () => {
    const fetch = mockFetchError(403);

    const provider = new GeminiProvider({
      config: loadConfig(visionConfig).vision,
      fetch,
    });

    await expect(
      provider.analyzeImage({
        image: { mimeType: "image/png", base64: "fake" },
        userPrompt: "Describe.",
      }),
    ).rejects.toThrow("Authentication failed");
  });

  it("healthCheck reports ok for healthy provider", async () => {
    const fetch = mockFetch({ models: [] });
    const provider = new GeminiProvider({
      config: loadConfig(visionConfig).vision,
      fetch,
    });

    const health = await provider.healthCheck();
    expect(health.ok).toBe(true);
    expect(health.provider).toBe("gemini");
  });

  it("healthCheck reports auth failure on 403", async () => {
    const fetch = mockFetchError(403);
    const provider = new GeminiProvider({
      config: loadConfig(visionConfig).vision,
      fetch,
    });

    const health = await provider.healthCheck();
    expect(health.ok).toBe(false);
    expect(health.message).toContain("Authentication failed");
  });

  it("createVisionProvider selects gemini from config", () => {
    const fetch = mockFetch({ candidates: [] });
    const provider = createVisionProvider(loadConfig(visionConfig), { fetch });
    expect(provider.name).toBe("gemini");
    expect(provider).toBeInstanceOf(GeminiProvider);
  });
});
