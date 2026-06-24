import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import type { LoadedImage } from "../../src/image/read-image.js";
import type { VisionProvider } from "../../src/providers/types.js";
import { analyzeImage } from "../../src/tools/analyze-image.js";

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

  it("includes mermaid output in diagram mode", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        summary: "Architecture diagram with 3 layers.",
        observations: [
          {
            type: "diagram",
            content: "Frontend, API, Database layers connected by arrows",
            confidence: 0.88,
          },
        ],
        inferences: [],
        uncertainties: [],
        recommended_next_steps: [],
        mermaid: "graph TD\n  A[Frontend] --> B[API]\n  B --> C[Database]",
      }),
    );

    const result = await analyzeImage(
      {
        image_path: "./fixture.png",
        mode: "diagram",
      },
      {
        config: testConfig,
        provider,
        readImage: vi.fn(async () => mockImage),
      },
    );

    expect(result.structured.mermaid).toBeDefined();
    expect(result.structured.mermaid).toContain("graph TD");
    expect(result.markdown).toContain("```mermaid");
  });

  it("includes table extraction in chart mode", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        summary: "Bar chart showing quarterly revenue.",
        observations: [
          {
            type: "visual",
            content: "Bar chart with Q1-Q4 2025 data",
            confidence: 0.9,
          },
        ],
        inferences: [],
        uncertainties: [],
        recommended_next_steps: [],
        tables: [
          {
            caption: "Quarterly Revenue 2025",
            headers: ["Quarter", "Revenue"],
            rows: [
              { Quarter: "Q1", Revenue: 12000 },
              { Quarter: "Q2", Revenue: 15000 },
            ],
          },
        ],
      }),
    );

    const result = await analyzeImage(
      {
        image_path: "./fixture.png",
        mode: "chart",
      },
      {
        config: testConfig,
        provider,
        readImage: vi.fn(async () => mockImage),
      },
    );

    expect(result.structured.tables).toHaveLength(1);
    expect(result.structured.tables[0]?.caption).toBe("Quarterly Revenue 2025");
    expect(result.structured.tables[0]?.rows).toHaveLength(2);
    expect(result.markdown).toContain("| Quarter");
    expect(result.markdown).toContain("Q1");
  });

  it("handles provider returning raw text (not JSON)", async () => {
    const provider = createMockProvider(
      "I can see a login screen with a username field and password field.",
    );

    const result = await analyzeImage(
      {
        image_path: "./fixture.png",
        mode: "general",
      },
      {
        config: testConfig,
        provider,
        readImage: vi.fn(async () => mockImage),
      },
    );

    expect(result.structured.summary).toBeTruthy();
    expect(result.structured.observations.length).toBeGreaterThanOrEqual(0);
    expect(result.structured.provider.model).toBe("gpt-4o-mini");
  });

  it("accepts image_url as an alternative to image_path", async () => {
    const result = await analyzeImage(
      {
        image_url: "https://example.com/image.png",
      },
      {
        config: testConfig,
        provider: createMockProvider("{}"),
        readImage: vi.fn(async () => mockImage),
      },
    );

    expect(result.structured.summary).toBeTruthy();
    expect(result.structured.provider.model).toBe("gpt-4o-mini");
  });

  it("rejects when both image_path and image_url are missing", async () => {
    await expect(
      analyzeImage(
        {},
        {
          config: testConfig,
          provider: createMockProvider("{}"),
          readImage: vi.fn(async () => mockImage),
        },
      ),
    ).rejects.toThrow(/required/i);
  });
});
