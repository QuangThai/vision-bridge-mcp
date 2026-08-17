import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ImageInterceptPlan } from "../../src/capabilities/types.js";
import type { AtlasConfig } from "../../src/config.js";
import {
  type ToolResultContentPart,
  type ToolResultImageInterceptInput,
  interceptToolResultImage,
} from "../../src/harness/tool-result-intercept.js";
import { assertPathAllowed } from "../../src/security/path-policy.js";

const PNG_DATA =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function imagePart(data = PNG_DATA): ToolResultContentPart {
  return { type: "image", data, mimeType: "image/png" };
}

function toolResultInput(
  overrides: Partial<ToolResultImageInterceptInput> = {},
): ToolResultImageInterceptInput {
  return {
    mainModelRef: "deepseek/deepseek-v4-flash",
    toolName: "read",
    toolCallId: "call-1",
    toolInput: { path: join(tmpdir(), "screenshot.png") },
    content: [],
    isError: false,
    runtimeSupportsVision: false,
    ...overrides,
  };
}

function interceptPlan(imagePaths: string[]): ImageInterceptPlan {
  return {
    shouldIntercept: true,
    reason: "Main model is text-only.",
    capabilities: null,
    images: imagePaths.map((path) => ({ path, source: "path", start: 0, end: path.length })),
    plannedCalls: imagePaths.map((imagePath) => ({
      tool: "analyze_image",
      imagePath,
      args: {
        image_path: imagePath,
        mode: "general",
        detail_level: "standard",
        output_format: "markdown_json",
      },
      reason: "Default general image analysis.",
    })),
  };
}

function planFromMessage(input: { messageText: string }): ImageInterceptPlan {
  const paths = [...input.messageText.matchAll(/^Attached image: (.+)$/gmu)].map(
    (match) => match[1],
  );
  return interceptPlan(paths);
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
    atlas: { allowedDirs: ["."] },
  } as unknown as AtlasConfig;
}

function evidenceExecutor(paths: string[]) {
  return vi.fn(async (call: { imagePath: string }) => {
    paths.push(call.imagePath);
    return {
      tool: "analyze_image" as const,
      imagePath: call.imagePath,
      markdown: "A screenshot of a landing page.",
    };
  });
}

describe("interceptToolResultImage", () => {
  it("returns untouched before persisting when the model has native vision", async () => {
    const result = await interceptToolResultImage(
      toolResultInput({
        mainModelRef: "openai/gpt-4o",
        content: [imagePart()],
        runtimeSupportsVision: true,
      }),
      {
        loadConfig: () => {
          throw new Error("should not load config");
        },
      },
    );

    expect(result).toEqual({ intercepted: false });
  });

  it("forceIntercept bypasses the native-vision short-circuit", async () => {
    const calls: string[] = [];
    const result = await interceptToolResultImage(
      toolResultInput({
        mainModelRef: "openai/gpt-4o",
        content: [imagePart()],
        runtimeSupportsVision: true,
        forceIntercept: true,
      }),
      {
        loadConfig: loadConfigStub,
        plan: vi.fn(async (input) => planFromMessage(input)),
        execute: evidenceExecutor(calls),
      },
    );

    expect(result.intercepted).toBe(true);
    expect(result.analyzedImageCount).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("ignores unrelated tool results and path-looking text", async () => {
    const plan = vi.fn(async () => interceptPlan([]));
    const result = await interceptToolResultImage(
      toolResultInput({
        toolName: "ls",
        toolInput: { path: "." },
        content: [{ type: "text", text: `assets/\nhero.png\n${join(tmpdir(), "other.png")}` }],
      }),
      { plan },
    );

    expect(result).toEqual({ intercepted: false });
    expect(plan).not.toHaveBeenCalled();
  });

  it("analyzes a normal Pi read image exactly once", async () => {
    const originalPath = join(tmpdir(), "original-screenshot.png");
    const calls: string[] = [];
    const content: ToolResultContentPart[] = [
      {
        type: "text",
        text: "Read image file [image/png]\n[Current model does not support images. The image will be omitted from this request.]",
      },
      imagePart(),
    ];

    const result = await interceptToolResultImage(
      toolResultInput({ toolInput: { path: originalPath }, content }),
      {
        loadConfig: loadConfigStub,
        plan: vi.fn(async (input) => planFromMessage(input)),
        execute: evidenceExecutor(calls),
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toBe(originalPath);
    expect(existsSync(calls[0])).toBe(false);
    expect(result.analyzedImageCount).toBe(1);
    expect(result.content?.slice(0, 2)).toEqual(content);
    expect(result.content?.[2]).toEqual(
      expect.objectContaining({ type: "text", text: expect.stringContaining("landing page") }),
    );
  });

  it("deduplicates identical image blocks by content", async () => {
    const calls: string[] = [];
    const result = await interceptToolResultImage(
      toolResultInput({ content: [imagePart(), imagePart()] }),
      {
        loadConfig: loadConfigStub,
        plan: vi.fn(async (input) => planFromMessage(input)),
        execute: evidenceExecutor(calls),
      },
    );

    expect(result.analyzedImageCount).toBe(1);
    expect(calls).toHaveLength(1);
  });

  it("uses a successful read path only when no image block exists", async () => {
    const imagePath = join(tmpdir(), "fallback.png");
    const execute = vi.fn(
      async (call: { imagePath: string }, options: { config: AtlasConfig }) => ({
        tool: "analyze_image" as const,
        imagePath: call.imagePath,
        markdown: options.config.atlas.allowedDirs.join(","),
      }),
    );

    const result = await interceptToolResultImage(
      toolResultInput({
        toolInput: { path: imagePath },
        content: [{ type: "text", text: "Read image file [image/png]" }],
      }),
      {
        loadConfig: loadConfigStub,
        plan: vi.fn(async () => interceptPlan([imagePath])),
        execute,
      },
    );

    expect(result.intercepted).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[1].config.atlas.allowedDirs).toEqual(["."]);
  });

  it("keeps read fallback paths subject to ATLAS_ALLOWED_DIRS", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "atlas-tool-result-project-"));
    const outsideDir = await mkdtemp(join(tmpdir(), "atlas-tool-result-outside-"));
    const outsideImage = join(outsideDir, "private.png");
    await writeFile(outsideImage, Buffer.from(PNG_DATA, "base64"));

    try {
      await expect(
        interceptToolResultImage(
          toolResultInput({
            toolInput: { path: outsideImage },
            content: [{ type: "text", text: "Read image file [image/png]" }],
          }),
          {
            cwd: projectDir,
            loadConfig: () => ({
              ...loadConfigStub(),
              atlas: { ...loadConfigStub().atlas, allowedDirs: ["."] },
            }),
            plan: vi.fn(async () => interceptPlan([outsideImage])),
            execute: vi.fn(async (call, options) => {
              await assertPathAllowed(call.imagePath, {
                cwd: projectDir,
                allowedDirs: options.config.atlas.allowedDirs,
              });
              return {
                tool: "analyze_image" as const,
                imagePath: call.imagePath,
                markdown: "should not run",
              };
            }),
          },
        ),
      ).rejects.toThrow("outside allowed directories");
    } finally {
      await rm(projectDir, { recursive: true, force: true });
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it("does not fall back to a failed read path", async () => {
    const plan = vi.fn(async () => interceptPlan([]));
    const result = await interceptToolResultImage(
      toolResultInput({
        isError: true,
        content: [{ type: "text", text: "ENOENT: screenshot.png" }],
      }),
      { plan },
    );

    expect(result).toEqual({ intercepted: false });
    expect(plan).not.toHaveBeenCalled();
  });

  it("ignores malformed image blocks instead of guessing a MIME type", async () => {
    const plan = vi.fn(async () => interceptPlan([]));
    const malformed = { type: "image", data: PNG_DATA } as unknown as ToolResultContentPart;
    const result = await interceptToolResultImage(
      toolResultInput({ toolName: "custom_image_tool", toolInput: {}, content: [malformed] }),
      { plan },
    );

    expect(result).toEqual({ intercepted: false });
    expect(plan).not.toHaveBeenCalled();
  });

  it("removes temporary images when the planner refuses interception", async () => {
    let persistedPath = "";
    const result = await interceptToolResultImage(toolResultInput({ content: [imagePart()] }), {
      plan: vi.fn(async (input) => {
        persistedPath = planFromMessage(input).plannedCalls[0]?.imagePath ?? "";
        expect(existsSync(persistedPath)).toBe(true);
        return noInterceptPlan("ATLAS_INTERCEPT_MODE=never");
      }),
    });

    expect(result).toEqual({ intercepted: false });
    expect(persistedPath).not.toBe("");
    expect(existsSync(persistedPath)).toBe(false);
  });

  it("removes temporary images when analysis fails", async () => {
    let persistedPath = "";
    await expect(
      interceptToolResultImage(toolResultInput({ content: [imagePart()] }), {
        loadConfig: loadConfigStub,
        plan: vi.fn(async (input) => planFromMessage(input)),
        execute: vi.fn(async (call: { imagePath: string }) => {
          persistedPath = call.imagePath;
          expect(existsSync(persistedPath)).toBe(true);
          throw new Error("provider unavailable");
        }),
      }),
    ).rejects.toThrow("provider unavailable");

    expect(existsSync(persistedPath)).toBe(false);
  });

  it("isolates temporary files across concurrent tool results", async () => {
    const paths: string[] = [];
    const execute = vi.fn(async (call: { imagePath: string }) => {
      paths.push(call.imagePath);
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {
        tool: "analyze_image" as const,
        imagePath: call.imagePath,
        markdown: "Concurrent screenshot.",
      };
    });
    const dependencies = {
      loadConfig: loadConfigStub,
      plan: vi.fn(async (input: { messageText: string }) => planFromMessage(input)),
      execute,
    };

    const [first, second] = await Promise.all([
      interceptToolResultImage(
        toolResultInput({ toolCallId: "call-a", content: [imagePart()] }),
        dependencies,
      ),
      interceptToolResultImage(
        toolResultInput({ toolCallId: "call-b", content: [imagePart()] }),
        dependencies,
      ),
    ]);

    expect(first.intercepted).toBe(true);
    expect(second.intercepted).toBe(true);
    expect(new Set(paths).size).toBe(2);
    expect(paths.every((path) => !existsSync(path))).toBe(true);
  });

  it("honors an already-aborted Pi signal before writing temporary files", async () => {
    const controller = new AbortController();
    controller.abort(new Error("cancelled"));

    await expect(
      interceptToolResultImage(toolResultInput({ content: [imagePart()] }), {
        signal: controller.signal,
      }),
    ).rejects.toThrow("cancelled");
  });
});
