import { describe, expect, it, vi } from "vitest";

// Mock sharp to bypass actual image processing in unit tests
vi.mock("sharp", () => {
  const mockSharp = vi.fn(() => ({
    extract: vi.fn(() => ({
      toBuffer: vi.fn(async () => Buffer.from("fake-cropped")),
    })),
    metadata: vi.fn(async () => ({ width: 100, height: 100 })),
    resize: vi.fn(() => ({
      toFormat: vi.fn(() => ({
        toBuffer: vi.fn(async () => Buffer.from("fake-resized")),
      })),
    })),
    toFormat: vi.fn(() => ({
      toBuffer: vi.fn(async () => Buffer.from("fake-formatted")),
    })),
    toBuffer: vi.fn(async () => Buffer.from("fake-output")),
  })) as unknown as typeof import("sharp");

  return { default: mockSharp };
});
import { loadConfig } from "../../src/config.js";
import type { LoadedImage } from "../../src/image/read-image.js";
import type { VisionProvider } from "../../src/providers/types.js";
import { extractRegion } from "../../src/tools/extract-region.js";

const testConfig = loadConfig({
  VISION_API_KEY: "sk-test",
  VISION_BASE_URL: "https://api.example.com/v1",
});

// Minimal valid 1×1 transparent PNG
const MINI_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

const mockImage: LoadedImage = {
  path: "./fixture.png",
  absolutePath: "/tmp/fixture.png",
  mimeType: "image/png",
  base64: MINI_PNG_BASE64,
  sizeBytes: Buffer.from(MINI_PNG_BASE64, "base64").length,
  resized: false,
  width: 100,
  height: 100,
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

describe("extractRegion", () => {
  it("returns markdown and validated structured output", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        summary: "A blue header bar is visible in this region.",
        observations: [
          {
            type: "visual",
            content: "Navigation bar with logo and 3 links",
            confidence: 0.88,
          },
        ],
        inferences: [
          {
            content: "This appears to be a website header section",
            confidence: 0.75,
            based_on: ["obs_001"],
          },
        ],
        uncertainties: [],
        recommended_next_steps: ["Check responsive behavior of nav bar"],
      }),
    );

    const result = await extractRegion(
      {
        image_path: "./fixture.png",
        region: { x: 0, y: 0, width: 100, height: 50 },
        mode: "general",
        detail_level: "standard",
      },
      {
        config: testConfig,
        provider,
        readImage: vi.fn(async () => mockImage),
      },
    );

    expect(result.markdown).toContain("## Extracted Region Analysis");
    expect(result.markdown).toContain("**Region:** (0, 0) 100×50 px");
    expect(result.markdown).toContain("blue header bar");
    expect(result.structured.summary).toBe("A blue header bar is visible in this region.");
    expect(result.structured.observations).toHaveLength(1);
    expect(result.regionCrop).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(result.structured.provider.model).toBe("gpt-4o-mini");
  });

  it("includes user prompt in the analysis request", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        summary: "Error message visible.",
        observations: [
          {
            type: "text",
            content: "Connection timeout",
            confidence: 0.95,
          },
        ],
        inferences: [],
        uncertainties: ["Could be network issue"],
        recommended_next_steps: [],
      }),
    );

    const result = await extractRegion(
      {
        image_path: "./fixture.png",
        region: { x: 200, y: 300, width: 150, height: 80 },
        prompt: "Focus on any error messages visible in this region",
        mode: "error_screenshot",
      },
      {
        config: testConfig,
        provider,
        readImage: vi.fn(async () => mockImage),
      },
    );

    expect(result.structured.summary).toBe("Error message visible.");
    expect(result.structured.observations[0]?.content).toContain("Connection timeout");
  });

  it("supports diagram mode with mermaid output", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        summary: "Architecture diagram showing 4 components.",
        observations: [
          {
            type: "diagram",
            content: "System architecture with frontend, API, database, cache layers",
            confidence: 0.85,
          },
        ],
        inferences: [],
        uncertainties: [],
        recommended_next_steps: [],
        mermaid: "graph TD\n  A[Frontend] --> B[API]\n  B --> C[Database]\n  B --> D[Cache]",
      }),
    );

    const result = await extractRegion(
      {
        image_path: "./fixture.png",
        region: { x: 50, y: 50, width: 400, height: 300 },
        mode: "diagram",
      },
      {
        config: testConfig,
        provider,
        readImage: vi.fn(async () => mockImage),
      },
    );

    expect(result.markdown).toContain("```mermaid");
    expect(result.structured.mermaid).toContain("graph TD");
  });

  it("rejects invalid region coordinates", async () => {
    const provider = createMockProvider("{}");
    await expect(
      extractRegion(
        {
          image_path: "./fixture.png",
          region: { x: -1, y: 0, width: 100, height: 50 },
        },
        {
          config: testConfig,
          provider,
          readImage: vi.fn(async () => mockImage),
        },
      ),
    ).rejects.toThrow();
  });

  it("rejects region with zero dimensions", async () => {
    const provider = createMockProvider("{}");
    await expect(
      extractRegion(
        {
          image_path: "./fixture.png",
          region: { x: 0, y: 0, width: 0, height: 50 },
        },
        {
          config: testConfig,
          provider,
          readImage: vi.fn(async () => mockImage),
        },
      ),
    ).rejects.toThrow();
  });

  it("handles non-existent image path gracefully", async () => {
    const provider = createMockProvider("{}");
    const mockReadImage = vi.fn(async () => {
      throw new Error("Image file not found: missing.png");
    });

    await expect(
      extractRegion(
        {
          image_path: "./missing.png",
          region: { x: 0, y: 0, width: 50, height: 50 },
        },
        {
          config: testConfig,
          provider,
          readImage: mockReadImage,
        },
      ),
    ).rejects.toThrow(/not found/);
  });

  it("handles provider network error gracefully", async () => {
    const provider = createMockProvider("{}");
    provider.analyzeImage = vi.fn().mockRejectedValue(new Error("Network timeout"));

    await expect(
      extractRegion(
        {
          image_path: "./fixture.png",
          region: { x: 0, y: 0, width: 100, height: 100 },
        },
        {
          config: testConfig,
          provider,
          readImage: vi.fn(async () => mockImage),
        },
      ),
    ).rejects.toThrow(/Network timeout/);
  });

  it("includes region info in markdown output", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        summary: "Region content.",
        observations: [],
        inferences: [],
        uncertainties: [],
        recommended_next_steps: [],
      }),
    );

    const result = await extractRegion(
      {
        image_path: "./fixture.png",
        region: { x: 100, y: 200, width: 300, height: 400 },
      },
      {
        config: testConfig,
        provider,
        readImage: vi.fn(async () => mockImage),
      },
    );

    expect(result.markdown).toContain("(100, 200)");
    expect(result.markdown).toContain("300×400");
    expect(result.regionCrop).toEqual({ x: 100, y: 200, width: 300, height: 400 });
  });
});
