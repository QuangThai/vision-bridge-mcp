import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import type { LoadedImage } from "../../src/image/read-image.js";
import type { VisionProvider } from "../../src/providers/types.js";
import {
  ClipboardImageError,
  analyzeClipboard,
  analyzeUiClipboard,
  diagnoseClipboard,
  ocrClipboard,
} from "../../src/tools/clipboard.js";

const testConfig = loadConfig({
  VISION_API_KEY: "sk-test",
  VISION_BASE_URL: "https://api.example.com/v1",
  ATLAS_ALLOWED_DIRS: ".",
});

function mockImage(path: string): LoadedImage {
  return {
    path,
    absolutePath: path,
    mimeType: "image/png",
    base64: "abc123",
    sizeBytes: 6,
    resized: false,
    width: 1,
    height: 1,
  };
}

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

describe("clipboard-first tools", () => {
  it("analyzes the current clipboard image and cleans up the temp file", async () => {
    const clipboardPath = join(tmpdir(), "atlas-clip-test.png");
    const cleanup = vi.fn();
    const provider = createMockProvider(
      JSON.stringify({
        summary: "Clipboard image shows a dialog.",
        observations: [{ type: "visual", content: "A dialog", confidence: 0.9 }],
        inferences: [],
        uncertainties: [],
        recommended_next_steps: [],
      }),
    );
    const readImage = vi.fn(async (imagePath: string, options) => {
      expect(imagePath).toBe(clipboardPath);
      expect(options.allowedDirs).toContain(tmpdir());
      return mockImage(imagePath);
    });

    const result = await analyzeClipboard(
      { prompt: "what is this?" },
      {
        config: testConfig,
        provider,
        readClipboardImage: vi.fn(async () => clipboardPath),
        cleanupClipboardImage: cleanup,
        readImage,
      },
    );

    expect(result.structured.summary).toBe("Clipboard image shows a dialog.");
    expect(cleanup).toHaveBeenCalledWith(clipboardPath);
  });

  it("throws a clear error when the clipboard has no image", async () => {
    await expect(
      analyzeClipboard(
        {},
        {
          config: testConfig,
          readClipboardImage: vi.fn(async () => null),
        },
      ),
    ).rejects.toBeInstanceOf(ClipboardImageError);
  });

  it("diagnoses clipboard screenshots using error_screenshot mode", async () => {
    const clipboardPath = join(tmpdir(), "atlas-error.png");
    const provider = createMockProvider(
      JSON.stringify({
        summary: "An error screenshot.",
        observations: [{ type: "error", content: "ERR_CONNECTION_TIMED_OUT", confidence: 0.95 }],
        inferences: [],
        uncertainties: [],
        recommended_next_steps: [],
      }),
    );
    const readImage = vi.fn(async (imagePath: string) => mockImage(imagePath));

    await diagnoseClipboard(
      { prompt: "what is wrong?" },
      {
        config: testConfig,
        provider,
        readClipboardImage: vi.fn(async () => clipboardPath),
        cleanupClipboardImage: vi.fn(),
        readImage,
      },
    );

    const call = vi.mocked(provider.analyzeImage).mock.calls[0]?.[0];
    expect(call?.userPrompt).toContain("mode: error_screenshot");
  });

  it("analyzes UI screenshots from the clipboard image", async () => {
    const clipboardPath = join(tmpdir(), "atlas-ui.png");
    const provider = createMockProvider(
      JSON.stringify({
        summary: "Clipboard UI analyzed.",
        screen_type: "dashboard",
        ui_elements: [{ id: "ui_001", type: "button", label: "Save", confidence: 0.9 }],
        layout: { structure: "Header and content", spacing_notes: [], responsive_hints: [] },
        accessibility_issues: [],
        implementation_plan: [],
        uncertainties: [],
      }),
    );

    const result = await analyzeUiClipboard(
      { target_framework: "react", goal: "implement" },
      {
        config: testConfig,
        provider,
        readClipboardImage: vi.fn(async () => clipboardPath),
        cleanupClipboardImage: vi.fn(),
        readImage: vi.fn(async (imagePath: string) => mockImage(imagePath)),
      },
    );

    expect(result.structured.screen_type).toBe("dashboard");
    expect(result.structured.ui_elements[0]?.label).toContain("Save");
  });

  it("extracts text from the clipboard image", async () => {
    const clipboardPath = join(tmpdir(), "atlas-ocr.png");
    const provider = createMockProvider(
      JSON.stringify({
        summary: "Clipboard text extracted.",
        visible_text: [{ id: "txt_001", text: "Build failed", region: "center", confidence: 0.9 }],
        layout_text: "Build failed",
        warnings: [],
      }),
    );

    const result = await ocrClipboard(
      { extract_code: true },
      {
        config: testConfig,
        provider,
        readClipboardImage: vi.fn(async () => clipboardPath),
        cleanupClipboardImage: vi.fn(),
        readImage: vi.fn(async (imagePath: string) => mockImage(imagePath)),
      },
    );

    expect(result.structured.layout_text).toBe("Build failed");
  });
});
