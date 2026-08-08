import { describe, expect, it, vi } from "vitest";
import type { ImageInterceptPlan } from "../../src/capabilities/types.js";
import type { AtlasConfig } from "../../src/config.js";
import {
  type ToolResultContentPart,
  interceptToolResultImage,
} from "../../src/harness/tool-result-intercept.js";

function interceptPlan(imagePath: string): ImageInterceptPlan {
  return {
    shouldIntercept: true,
    reason: "Main model is text-only.",
    capabilities: null,
    images: [],
    plannedCalls: [
      {
        tool: "analyze_image",
        imagePath,
        args: {
          image_path: imagePath,
          mode: "general",
          detail_level: "standard",
          output_format: "markdown_json",
        },
        reason: "Default general image analysis.",
      },
    ],
  };
}

function noInterceptPlan(reason = "Main model supports native vision."): ImageInterceptPlan {
  return {
    shouldIntercept: false,
    reason,
    capabilities: null,
    images: [],
    plannedCalls: [],
  };
}

function loadConfigStub(): AtlasConfig {
  return {
    vision: {
      provider: "openai-compatible",
      baseUrl: "https://example.com/v1",
      apiKey: "test",
      model: "gpt-4o-mini",
    },
    atlas: { allowedDirs: [] },
  } as unknown as AtlasConfig;
}

describe("interceptToolResultImage", () => {
  it("returns untouched when the model has native vision", async () => {
    const result = await interceptToolResultImage(
      {
        mainModelRef: "openai/gpt-4o",

        toolInput: { path: "/tmp/screenshot.png" },
        content: [{ type: "text", text: "Read image file [png]" }],
        runtimeSupportsVision: true,
      },
      {
        loadConfig: () => {
          throw new Error("should not load config");
        },
      },
    );

    expect(result.intercepted).toBe(false);
    expect(result.content).toBeUndefined();
  });

  it("forceIntercept bypasses the native-vision short-circuit", async () => {
    const plan = interceptPlan("/tmp/screenshot.png");
    const execute = vi.fn(async () => ({
      tool: "analyze_image" as const,
      imagePath: "/tmp/screenshot.png",
      markdown: "A screenshot of a landing page.",
    }));

    const result = await interceptToolResultImage(
      {
        mainModelRef: "openai/gpt-4o",

        toolInput: { path: "/tmp/screenshot.png" },
        content: [{ type: "text", text: "Read image file [png]" }],
        runtimeSupportsVision: true,
        forceIntercept: true,
      },
      {
        loadConfig: loadConfigStub,
        plan: vi.fn(async () => plan),
        execute,
      },
    );

    expect(result.intercepted).toBe(true);
    expect(result.analyzedImageCount).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("returns untouched when the result contains no image", async () => {
    const result = await interceptToolResultImage(
      {
        mainModelRef: "deepseek/deepseek-v4-flash",

        toolInput: { command: "ls" },
        content: [{ type: "text", text: "src/\ntests/" }],
        runtimeSupportsVision: false,
      },
      {
        loadConfig: () => {
          throw new Error("should not load config");
        },
      },
    );

    expect(result.intercepted).toBe(false);
  });

  it("analyzes an image path from the read tool input and appends evidence", async () => {
    const imagePath = "/tmp/screenshot.png";
    const plan = interceptPlan(imagePath);
    const execute = vi.fn(async () => ({
      tool: "analyze_image" as const,
      imagePath,
      markdown: "A construction-site hero banner for XKELEX.",
    }));
    const planFn = vi.fn(async () => plan);

    const result = await interceptToolResultImage(
      {
        mainModelRef: "opencode/deepseek-v4-flash-free",

        toolInput: { path: imagePath },
        content: [{ type: "text", text: "Read image file [png]" }],
        runtimeSupportsVision: false,
        env: { MAIN_MODEL_REF: "opencode/deepseek-v4-flash-free" },
      },
      {
        loadConfig: loadConfigStub,
        plan: planFn,
        execute,
      },
    );

    expect(result.intercepted).toBe(true);
    expect(result.analyzedImageCount).toBe(1);
    // Original content preserved, evidence appended as a new text part.
    expect(result.content).toHaveLength(2);
    expect(result.content?.[0]).toEqual({ type: "text", text: "Read image file [png]" });
    expect(result.content?.[1].type).toBe("text");
    expect((result.content?.[1] as { text: string }).text).toContain("XKELEX");
    // The vision provider must be allowed to read the tool's image directory.
    expect(planFn).toHaveBeenCalledTimes(1);
  });

  it("forwards extraAllowedDirs for the tool image directory", async () => {
    const imagePath = "/tmp/shots/capture.png";
    const plan = interceptPlan(imagePath);
    const execute = vi.fn(async () => ({
      tool: "analyze_image" as const,
      imagePath,
      markdown: "A UI screenshot.",
    }));
    const loadConfig = vi.fn(loadConfigStub);

    await interceptToolResultImage(
      {
        mainModelRef: "deepseek/deepseek-v4-flash",

        toolInput: { path: imagePath },
        content: [{ type: "text", text: "Read image file [png]" }],
        runtimeSupportsVision: false,
      },
      {
        loadConfig,
        plan: vi.fn(async () => plan),
        execute,
      },
    );

    // loadConfig was called once (intercept pipeline) — extraAllowedDirs are
    // applied inside interceptImagesForTextModel via the execute config. Verify
    // the execute call received a config that permits the image's directory.
    expect(execute).toHaveBeenCalledTimes(1);
    const executeConfig = execute.mock.calls[0]?.[1] as { config: AtlasConfig };
    expect(executeConfig.config.atlas.allowedDirs).toContain("/tmp/shots");
  });

  it("persists image content parts and analyzes the persisted path", async () => {
    // A 1x1 transparent PNG.
    const pngData =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const planFn = vi.fn(async (input: { messageText: string }) => {
      const match = input.messageText.match(/Attached image: (.+)/);
      const imagePath = match?.[1] ?? "/tmp/attached.png";
      return interceptPlan(imagePath);
    });

    const result = await interceptToolResultImage(
      {
        mainModelRef: "deepseek/deepseek-v4-flash",

        content: [{ type: "image", data: pngData, mimeType: "image/png" } as ToolResultContentPart],
        runtimeSupportsVision: false,
        sessionId: "test-session",
      },
      {
        loadConfig: loadConfigStub,
        plan: planFn,
        execute: vi.fn(async (call: { imagePath: string }) => ({
          tool: "analyze_image" as const,
          imagePath: call.imagePath,
          markdown: "A tiny transparent image.",
        })),
      },
    );

    expect(result.intercepted).toBe(true);
    // The persisted image lives under the atlas temp dir for the session.
    expect(result.content?.[1].type).toBe("text");
    expect(result.content?.[1]).not.toBeUndefined();
  });

  it("does not intercept when the planner decides against it", async () => {
    const result = await interceptToolResultImage(
      {
        mainModelRef: "deepseek/deepseek-v4-flash",

        toolInput: { path: "/tmp/screenshot.png" },
        content: [{ type: "text", text: "Read image file [png]" }],
        runtimeSupportsVision: false,
      },
      {
        loadConfig: loadConfigStub,
        plan: vi.fn(async () =>
          noInterceptPlan("ATLAS_INTERCEPT_MODE=never: interception disabled."),
        ),
      },
    );

    expect(result.intercepted).toBe(false);
    expect(result.content).toBeUndefined();
  });
});
