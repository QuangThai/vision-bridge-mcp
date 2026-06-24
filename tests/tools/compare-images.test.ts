import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { normalizeCompareImagesOutput } from "../../src/extraction/normalize.js";
import type { LoadedImage } from "../../src/image/read-image.js";
import type { VisionProvider } from "../../src/providers/types.js";
import { compareImages } from "../../src/tools/compare-images.js";

const testConfig = loadConfig({
  VISION_API_KEY: "sk-test",
  VISION_BASE_URL: "https://api.example.com/v1",
});

const mockBefore: LoadedImage = {
  path: "./before.png",
  absolutePath: "/tmp/before.png",
  mimeType: "image/png",
  base64: "before",
  sizeBytes: 6,
  resized: false,
  width: 1,
  height: 1,
};

const mockAfter: LoadedImage = {
  path: "./after.png",
  absolutePath: "/tmp/after.png",
  mimeType: "image/png",
  base64: "after",
  sizeBytes: 6,
  resized: false,
  width: 1,
  height: 1,
};

function createMockProvider(text: string): VisionProvider {
  return {
    name: "openai-compatible",
    analyzeImage: vi.fn(),
    compareImages: vi.fn(async () => ({
      text,
      provider: "openai-compatible",
      model: "gpt-4o-mini",
      raw: {},
    })),
    healthCheck: vi.fn(async () => ({
      ok: true,
      provider: "openai-compatible",
      model: "gpt-4o-mini",
    })),
  };
}

describe("normalizeCompareImagesOutput", () => {
  it("filters differences below severity threshold", () => {
    const output = normalizeCompareImagesOutput(
      {
        summary: "Header layout shifted.",
        differences: [
          {
            type: "layout",
            description: "Minor padding change",
            severity: "low",
            before_evidence: "16px padding",
            after_evidence: "12px padding",
            confidence: 0.7,
          },
          {
            type: "missing_element",
            description: "Save button missing",
            severity: "high",
            before_evidence: "Save button visible",
            after_evidence: "Button absent",
            confidence: 0.92,
          },
        ],
        regression_likelihood: "high",
        recommended_next_steps: ["Restore Save button"],
      },
      {
        text: "",
        provider: "openai-compatible",
        model: "gpt-4o-mini",
        raw: {},
      },
      "medium",
    );

    expect(output.differences).toHaveLength(1);
    expect(output.differences[0]?.description).toContain("Save button");
  });
});

describe("compareImages", () => {
  it("returns markdown and validated comparison output", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        summary: "Primary CTA color changed and footer text updated.",
        differences: [
          {
            type: "color",
            description: "Primary button color changed from blue to green",
            severity: "medium",
            before_evidence: "Blue CTA",
            after_evidence: "Green CTA",
            confidence: 0.86,
          },
          {
            type: "text",
            description: "Footer copyright year changed",
            severity: "low",
            before_evidence: "2024",
            after_evidence: "2025",
            confidence: 0.8,
          },
        ],
        regression_likelihood: "medium",
        recommended_next_steps: ["Confirm intentional brand color update"],
      }),
    );

    const readImage = vi.fn(async (path: string) =>
      path.includes("before") ? mockBefore : mockAfter,
    );

    const result = await compareImages(
      {
        before_path: "./before.png",
        after_path: "./after.png",
        focus: "layout",
        severity_threshold: "low",
      },
      {
        config: testConfig,
        provider,
        readImage,
      },
    );

    expect(readImage).toHaveBeenCalledTimes(2);
    expect(provider.compareImages).toHaveBeenCalledOnce();
    expect(result.markdown).toContain("## Differences");
    expect(result.structured.differences).toHaveLength(2);
    expect(result.structured.regression_likelihood).toBe("medium");
  });

  it("passes focus and severity threshold into provider prompt", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        summary: "No major differences.",
        differences: [],
        regression_likelihood: "none",
        recommended_next_steps: [],
      }),
    );

    await compareImages(
      {
        before_path: "./before.png",
        after_path: "./after.png",
        focus: "text",
        severity_threshold: "high",
      },
      {
        config: testConfig,
        provider,
        readImage: vi.fn(async (path: string) =>
          path.includes("before") ? mockBefore : mockAfter,
        ),
      },
    );

    const prompt = vi.mocked(provider.compareImages).mock.calls[0]?.[0].userPrompt;
    expect(prompt).toContain("focus: text");
    expect(prompt).toContain("severity_threshold: high");
    expect(prompt).toContain("BEFORE image");
  });
});
