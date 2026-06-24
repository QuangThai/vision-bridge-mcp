import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import type { LoadedImage } from "../../src/image/read-image.js";
import type { VisionProvider } from "../../src/providers/types.js";
import { analyzeImageBatch } from "../../src/tools/analyze-image-batch.js";

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

describe("analyzeImageBatch", () => {
  it("analyzes multiple images and returns combined results", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        summary: "A login form is visible.",
        observations: [
          {
            type: "visual",
            content: "Username and password fields",
            confidence: 0.92,
          },
        ],
        inferences: [],
        uncertainties: [],
        recommended_next_steps: ["Add form validation"],
      }),
    );

    const mockReadImage = vi.fn(async () => mockImage);

    const result = await analyzeImageBatch(
      {
        images: [
          { image_path: "./login.png", mode: "general" },
          { image_path: "./dashboard.png", mode: "general" },
        ],
        detail_level: "standard",
      },
      {
        config: testConfig,
        provider,
        readImage: mockReadImage,
      },
    );

    expect(result.structured.total_processed).toBe(2);
    expect(result.structured.failed_count).toBe(0);
    expect(result.structured.errors).toHaveLength(0);
    expect(result.structured.items).toHaveLength(2);
    expect(result.markdown).toContain("Batch Analysis Summary");
    expect(result.markdown).toContain("Images processed:");
    expect(result.markdown).toContain("2/2");

    // Each item should have its own analysis
    for (const item of result.structured.items) {
      expect(item.result.summary).toBe("A login form is visible.");
      expect(item.result.observations).toHaveLength(1);
    }
  });

  it("handles partial failures gracefully", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        summary: "Dashboard visible.",
        observations: [],
        inferences: [],
        uncertainties: [],
        recommended_next_steps: [],
      }),
    );

    const mockReadImage = vi
      .fn()
      .mockResolvedValueOnce(mockImage) // First image succeeds
      .mockRejectedValueOnce(new Error("File not found: missing.png")); // Second image fails

    const result = await analyzeImageBatch(
      {
        images: [
          { image_path: "./dashboard.png" },
          { image_path: "./missing.png" },
        ],
      },
      {
        config: testConfig,
        provider,
        readImage: mockReadImage,
      },
    );

    expect(result.structured.total_processed).toBe(1);
    expect(result.structured.failed_count).toBe(1);
    expect(result.structured.errors).toHaveLength(1);
    expect(result.structured.errors[0]?.image_path).toBe("./missing.png");
    expect(result.structured.errors[0]?.error).toContain("File not found");
    expect(result.markdown).toContain("Failed:");
    expect(result.markdown).toContain("1/2");
    expect(result.markdown).toContain("❌");
  });

  it("enforces batch size limit of 10", async () => {
    const provider = createMockProvider("{}");

    const manyImages = Array.from({ length: 11 }, (_, i) => ({
      image_path: `./img${i}.png`,
    }));

    await expect(
      analyzeImageBatch(
        {
          images: manyImages,
        },
        {
          config: testConfig,
          provider,
          readImage: vi.fn(async () => mockImage),
        },
      ),
    ).rejects.toThrow();
  });

  it("handles different modes per image", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        summary: "Content detected.",
        observations: [],
        inferences: [],
        uncertainties: [],
        recommended_next_steps: [],
      }),
    );

    const result = await analyzeImageBatch(
      {
        images: [
          { image_path: "./diagram.png", mode: "diagram" },
          { image_path: "./chart.png", mode: "chart" },
          { image_path: "./error.png", mode: "error_screenshot" },
        ],
      },
      {
        config: testConfig,
        provider,
        readImage: vi.fn(async () => mockImage),
      },
    );

    expect(result.structured.total_processed).toBe(3);
    expect(result.structured.failed_count).toBe(0);
  });

  it("handles provider errors gracefully in batch", async () => {
    const provider = createMockProvider("{}");
    provider.analyzeImage = vi.fn().mockRejectedValue(new Error("Provider rate limited"));

    const result = await analyzeImageBatch(
      {
        images: [
          { image_path: "./img1.png" },
          { image_path: "./img2.png" },
        ],
      },
      {
        config: testConfig,
        provider,
        readImage: vi.fn(async () => mockImage),
      },
    );

    expect(result.structured.total_processed).toBe(0);
    expect(result.structured.failed_count).toBe(2);
    expect(result.structured.errors).toHaveLength(2);
    expect(result.structured.errors[0]?.error).toContain("Provider rate limited");
  });

  it("handles single image batch", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        summary: "Single image result.",
        observations: [{ type: "visual", content: "Content", confidence: 0.9 }],
        inferences: [],
        uncertainties: [],
        recommended_next_steps: [],
      }),
    );

    const result = await analyzeImageBatch(
      {
        images: [{ image_path: "./single.png" }],
      },
      {
        config: testConfig,
        provider,
        readImage: vi.fn(async () => mockImage),
      },
    );

    expect(result.structured.total_processed).toBe(1);
    expect(result.structured.failed_count).toBe(0);
    expect(result.structured.items[0]?.image_path).toBe("./single.png");
  });

  it("rejects empty images array", async () => {
    const provider = createMockProvider("{}");

    await expect(
      analyzeImageBatch(
        {
          images: [],
        },
        {
          config: testConfig,
          provider,
          readImage: vi.fn(async () => mockImage),
        },
      ),
    ).rejects.toThrow();
  });
});
