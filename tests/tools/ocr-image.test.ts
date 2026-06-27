import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { normalizeOcrImageOutput, renderOcrImageMarkdown } from "../../src/extraction/normalize.js";
import type { LoadedImage } from "../../src/image/read-image.js";
import type { VisionProvider } from "../../src/providers/types.js";
import { ocrImage } from "../../src/tools/ocr-image.js";

const testConfig = loadConfig({
  VISION_API_KEY: "sk-test",
  VISION_BASE_URL: "https://api.example.com/v1",
});

const mockImage: LoadedImage = {
  path: "./error.png",
  absolutePath: "/tmp/error.png",
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

describe("normalizeOcrImageOutput", () => {
  it("adds security warning to normalized output", () => {
    const output = normalizeOcrImageOutput(
      {
        summary: "Error dialog visible.",
        visible_text: [
          {
            text: "TypeError: Cannot read property",
            region: "center",
            confidence: 0.92,
          },
        ],
        layout_text: "TypeError: Cannot read property",
        warnings: [],
      },
      {
        text: "",
        provider: "openai-compatible",
        model: "gpt-4o-mini",
        raw: {},
      },
    );

    expect(output.visible_text[0]?.id).toBe("txt_001");
    expect(output.warnings.some((warning) => warning.includes("untrusted evidence"))).toBe(true);
  });
});

describe("ocrImage", () => {
  it("returns markdown and validated structured OCR output", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        summary: "Terminal output with an error message.",
        visible_text: [
          {
            text: "npm ERR! code ELIFECYCLE",
            region: "top-left",
            confidence: 0.95,
          },
        ],
        layout_text: "npm ERR! code ELIFECYCLE",
        warnings: ["Possible stack trace truncated."],
      }),
    );

    const result = await ocrImage(
      {
        image_path: "./error.png",
        preserve_layout: true,
        extract_tables: false,
        extract_code: false,
      },
      {
        config: testConfig,
        provider,
        readImage: vi.fn(async () => mockImage),
      },
    );

    expect(result.markdown).toContain("## Summary");
    expect(result.markdown).toContain("npm ERR!");
    expect(result.structured.visible_text[0]?.text).toContain("ELIFECYCLE");
    expect(
      result.structured.warnings.some((warning) => warning.includes("untrusted evidence")),
    ).toBe(true);
    expect(renderOcrImageMarkdown(result.structured)).toContain("## Warnings");
  });

  it("passes OCR options into provider prompt", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        summary: "Code snippet detected.",
        visible_text: [{ text: "const x = 1;", region: "unknown", confidence: 0.8 }],
        layout_text: "const x = 1;",
        warnings: [],
      }),
    );

    await ocrImage(
      {
        image_path: "./code.png",
        preserve_layout: false,
        extract_tables: true,
        extract_code: true,
      },
      {
        config: testConfig,
        provider,
        readImage: vi.fn(async () => mockImage),
      },
    );

    const call = vi.mocked(provider.analyzeImage).mock.calls[0]?.[0];
    expect(call?.userPrompt).toContain("extract_tables: true");
    expect(call?.userPrompt).toContain("extract_code: true");
    expect(call?.userPrompt).toContain("preserve_layout: false");
  });

  it("accepts image_url as an alternative to image_path", async () => {
    const result = await ocrImage(
      {
        image_url: "https://example.com/screenshot.png",
        preserve_layout: true,
      },
      {
        config: testConfig,
        provider: createMockProvider(
          JSON.stringify({
            summary: "Terminal output.",
            visible_text: [{ text: "test", region: "unknown", confidence: 0.9 }],
            layout_text: "",
            warnings: [],
          }),
        ),
        readImage: vi.fn(async () => mockImage),
      },
    );

    expect(result.markdown).toContain("## Summary");
    expect(result.structured.visible_text.length).toBeGreaterThan(0);
  });

  it("rejects when both image_path and image_url are missing", async () => {
    await expect(
      ocrImage(
        { preserve_layout: true },
        {
          config: testConfig,
          provider: createMockProvider("{}"),
          readImage: vi.fn(async () => mockImage),
        },
      ),
    ).rejects.toThrow(/required/i);
  });
});
