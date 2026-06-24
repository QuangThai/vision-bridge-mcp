import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { analyzeImage } from "../../src/tools/analyze-image.js";
import type { LoadedImage } from "../../src/image/read-image.js";
import type { VisionProvider } from "../../src/providers/types.js";

const testConfig = loadConfig({
  VISION_API_KEY: "sk-test",
  VISION_BASE_URL: "https://api.example.com/v1",
});

const mockImage: LoadedImage = {
  path: "./fixture.png",
  absolutePath: "/tmp/fixture.png",
  mimeType: "image/png",
  base64: "abc123",
  sizeBytes: 6,
  resized: false,
  width: 1,
  height: 1,
};

function createMockProvider(text: string): VisionProvider {
  return {
    name: "openai-compatible",
    analyzeImage: vi.fn(async () => ({
      text,
      provider: "openai-compatible",
      model: "gpt-4o-mini",
      raw: {},
    })),
    compareImages: vi.fn(),
    healthCheck: vi.fn(async () => ({
      ok: true,
      provider: "openai-compatible",
      model: "gpt-4o-mini",
    })),
  };
}

describe("analyzeImage", () => {
  it("returns markdown and validated structured output", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        summary: "A red button is visible.",
        observations: [
          {
            type: "visual",
            content: "Primary button with label 'Save'",
            confidence: 0.91,
          },
        ],
        inferences: [
          {
            content: "This is likely a form submit action",
            confidence: 0.7,
            based_on: ["obs_001"],
          },
        ],
        uncertainties: [],
        recommended_next_steps: ["Confirm button handler in code"],
      }),
    );

    const result = await analyzeImage(
      {
        image_path: "./fixture.png",
        mode: "general",
        detail_level: "standard",
      },
      {
        config: testConfig,
        provider,
        readImage: vi.fn(async () => mockImage),
      },
    );

    expect(result.markdown).toContain("## Summary");
    expect(result.markdown).toContain("Primary button");
    expect(result.structured.summary).toBe("A red button is visible.");
    expect(result.structured.observations[0]?.type).toBe("visual");
    expect(result.structured.inferences).toHaveLength(1);
    expect(result.structured.provider.model).toBe("gpt-4o-mini");
  });

  it("rejects unsupported image_url in MVP", async () => {
    await expect(
      analyzeImage(
        {
          image_url: "https://example.com/image.png",
        },
        {
          config: testConfig,
          provider: createMockProvider("{}"),
          readImage: vi.fn(async () => mockImage),
        },
      ),
    ).rejects.toThrow(/image_path is required/i);
  });
});
