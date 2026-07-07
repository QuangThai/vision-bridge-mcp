import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../../src/config.js";
import { normalizeUiScreenshotOutput } from "../../src/extraction/normalize.js";
import type { LoadedImage } from "../../src/image/read-image.js";
import type { VisionProvider } from "../../src/providers/types.js";
import { analyzeUiScreenshot } from "../../src/tools/analyze-ui-screenshot.js";

const testConfig = loadConfig({
  VISION_API_KEY: "sk-test",
  VISION_BASE_URL: "https://api.example.com/v1",
});

const mockImage: LoadedImage = {
  path: "./login.png",
  absolutePath: "/tmp/login.png",
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

describe("normalizeUiScreenshotOutput", () => {
  it("always includes static screenshot uncertainty", () => {
    const output = normalizeUiScreenshotOutput(
      {
        summary: "Login form with email and password fields.",
        screen_type: "login",
        ui_elements: [
          {
            type: "input",
            label: "Email",
            state: "default",
            position: "top-center",
            implementation_hint: "Use labeled text input",
            confidence: 0.9,
          },
        ],
        layout: {
          structure: "Centered card with stacked fields",
          spacing_notes: ["Generous vertical spacing"],
          responsive_hints: [],
        },
        accessibility_issues: ["Password field lacks visible label"],
        implementation_plan: ["Create form shell", "Add email and password inputs"],
        uncertainties: [],
      },
      {
        text: "",
        provider: "openai-compatible",
        model: "gpt-4o-mini",
        raw: {},
      },
    );

    expect(output.ui_elements[0]?.id).toBe("ui_001");
    expect(output.screen_type).toBe("login");
    expect(output.uncertainties.some((item) => item.includes("static screenshot"))).toBe(true);
  });
});

describe("analyzeUiScreenshot", () => {
  it("returns structured UI analysis with implementation hints", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        summary: "Login screen with primary CTA.",
        screen_type: "login",
        ui_elements: [
          {
            type: "button",
            label: "Sign in",
            state: "default",
            position: "bottom-center",
            implementation_hint: "Primary submit button",
            confidence: 0.88,
          },
        ],
        layout: {
          structure: "Single-column centered form",
          spacing_notes: ["24px vertical rhythm"],
          responsive_hints: ["Likely full-width on mobile"],
        },
        accessibility_issues: ["Check button contrast"],
        implementation_plan: ["Build auth card", "Wire submit handler"],
        uncertainties: ["Submit loading state not visible"],
      }),
    );

    const result = await analyzeUiScreenshot(
      {
        image_path: "./login.png",
        target_framework: "react",
        style_system: "tailwind",
        goal: "implement",
      },
      {
        config: testConfig,
        provider,
        readImage: vi.fn(async () => mockImage),
      },
    );

    expect(result.markdown).toContain("## UI elements");
    expect(result.markdown).toContain("Sign in");
    expect(result.structured.screen_type).toBe("login");
    expect(result.structured.ui_elements[0]?.implementation_hint).toContain("submit");
    expect(result.structured.implementation_plan).toHaveLength(2);
    expect(result.structured.uncertainties.length).toBeGreaterThan(0);
  });

  it("passes framework, style system, and goal into provider prompt", async () => {
    const provider = createMockProvider(
      JSON.stringify({
        summary: "Dashboard",
        screen_type: "dashboard",
        ui_elements: [],
        layout: { structure: "", spacing_notes: [], responsive_hints: [] },
        accessibility_issues: [],
        implementation_plan: [],
        uncertainties: [],
      }),
    );

    await analyzeUiScreenshot(
      {
        image_path: "./dashboard.png",
        target_framework: "vue",
        style_system: "shadcn",
        goal: "accessibility_review",
      },
      {
        config: testConfig,
        provider,
        readImage: vi.fn(async () => mockImage),
      },
    );

    const prompt = vi.mocked(provider.analyzeImage).mock.calls[0]?.[0].userPrompt;
    expect(prompt).toContain("target_framework (untrusted user input): vue");
    expect(prompt).toContain("style_system (untrusted user input): shadcn");
    expect(prompt).toContain("goal (untrusted user input): accessibility_review");
    expect(prompt).toContain("Do not invent hidden state");
  });

  it("accepts image_url as an alternative to image_path", async () => {
    const result = await analyzeUiScreenshot(
      {
        image_url: "https://example.com/screenshot.png",
        target_framework: "react",
        style_system: "tailwind",
        goal: "describe",
      },
      {
        config: testConfig,
        provider: createMockProvider(
          JSON.stringify({
            summary: "A dashboard.",
            screen_type: "dashboard",
            ui_elements: [],
            layout: { structure: "", spacing_notes: [], responsive_hints: [] },
            accessibility_issues: [],
            implementation_plan: [],
            uncertainties: [],
          }),
        ),
        readImage: vi.fn(async () => mockImage),
      },
    );

    expect(result.markdown).toContain("## Summary");
  });

  it("rejects when both image_path and image_url are missing", async () => {
    await expect(
      analyzeUiScreenshot(
        { target_framework: "react", style_system: "tailwind", goal: "describe" },
        {
          config: testConfig,
          provider: createMockProvider("{}"),
          readImage: vi.fn(async () => mockImage),
        },
      ),
    ).rejects.toThrow(/required/i);
  });
});
