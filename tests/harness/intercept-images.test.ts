import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ImageInterceptPlan } from "../../src/capabilities/types.js";
import { interceptImagesForTextModel } from "../../src/harness/intercept-images.js";

describe("interceptImagesForTextModel", () => {
  it("returns original message when intercept is not needed", async () => {
    const plan: ImageInterceptPlan = {
      shouldIntercept: false,
      reason: "Main model supports native vision.",
      capabilities: null,
      images: [],
      plannedCalls: [],
    };

    const result = await interceptImagesForTextModel(
      {
        mainModelRef: "openai/gpt-4o-mini",
        messageText: "fix login",
      },
      {},
      {
        plan: vi.fn(async () => plan),
        loadConfig: () => {
          throw new Error("should not load config");
        },
      },
    );

    expect(result.intercepted).toBe(false);
    expect(result.messageText).toBe("fix login");
  });

  it("forwards env to the intercept planner", async () => {
    const plan: ImageInterceptPlan = {
      shouldIntercept: false,
      reason: "Main model supports native vision.",
      capabilities: null,
      images: [],
      plannedCalls: [],
    };
    const planFn = vi.fn(async () => plan);
    const hookEnv = { CURSOR_UNDERLYING_MODEL: "openai/gpt-4o" };

    await interceptImagesForTextModel(
      {
        mainModelRef: "cursor/composer-2.5",
        messageText: "check ./shot.png",
        env: hookEnv,
      },
      {},
      {
        plan: planFn,
        loadConfig: () => {
          throw new Error("should not load config");
        },
      },
    );

    expect(planFn).toHaveBeenCalledWith(expect.objectContaining({ env: hookEnv }), {}, {});
  });

  it("forwards runtimeSupportsVision to the intercept planner", async () => {
    const plan: ImageInterceptPlan = {
      shouldIntercept: false,
      reason: "Main model supports native vision.",
      capabilities: null,
      images: [],
      plannedCalls: [],
    };
    const planFn = vi.fn(async () => plan);

    await interceptImagesForTextModel(
      {
        mainModelRef: "deepseek/deepseek-v4-flash",
        messageText: "check ./shot.png",
        runtimeSupportsVision: true,
      },
      {},
      {
        plan: planFn,
        loadConfig: () => {
          throw new Error("should not load config");
        },
      },
    );

    expect(planFn).toHaveBeenCalledWith(
      expect.objectContaining({ runtimeSupportsVision: true }),
      {},
      {},
    );
  });

  it("adds the Pi clipboard temp directory to allowed dirs for intercepted Pi paste images", async () => {
    const imagePath = join(tmpdir(), "pi-clipboard-62c305f5-bbde-4714-9488-29ac7d655b76.png");
    const plan: ImageInterceptPlan = {
      shouldIntercept: true,
      reason: "No native vision.",
      capabilities: null,
      images: [{ path: imagePath, source: "path", start: 0, end: imagePath.length }],
      plannedCalls: [
        {
          tool: "analyze_image",
          imagePath,
          args: { image_path: imagePath, mode: "general" },
          reason: "default",
        },
      ],
    };
    const execute = vi.fn(async () => ({
      tool: "analyze_image" as const,
      imagePath,
      markdown: "## Summary\nPasted image visible.",
    }));

    await interceptImagesForTextModel(
      {
        mainModelRef: "deepseek/deepseek-v4-flash",
        messageText: `check ${imagePath}`,
      },
      {},
      {
        plan: vi.fn(async () => plan),
        loadConfig: () => ({
          vision: {
            provider: "openai-compatible",
            baseUrl: "https://api.example.com/v1",
            apiKey: "sk-test",
            model: "gpt-4o-mini",
            timeoutMs: 60_000,
            maxImageMb: 10,
            maxOutputTokens: 4_000,
          },
          atlas: {
            allowedDirs: ["."],
            storeHistory: false,
            logLevel: "info",
            logImageContent: false,
            redactSecrets: true,
            defaultDetailLevel: "standard",
          },
        }),
        execute,
      },
    );

    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        config: expect.objectContaining({
          atlas: expect.objectContaining({
            allowedDirs: [".", dirname(imagePath)],
          }),
        }),
      }),
    );
  });

  it("does not add arbitrary temp image paths to allowed dirs", async () => {
    const imagePath = join(tmpdir(), "untrusted.png");
    const plan: ImageInterceptPlan = {
      shouldIntercept: true,
      reason: "No native vision.",
      capabilities: null,
      images: [{ path: imagePath, source: "path", start: 0, end: imagePath.length }],
      plannedCalls: [
        {
          tool: "analyze_image",
          imagePath,
          args: { image_path: imagePath, mode: "general" },
          reason: "default",
        },
      ],
    };
    const execute = vi.fn(async () => ({
      tool: "analyze_image" as const,
      imagePath,
      markdown: "## Summary\nUntrusted temp image.",
    }));

    await interceptImagesForTextModel(
      {
        mainModelRef: "deepseek/deepseek-v4-flash",
        messageText: `check ${imagePath}`,
      },
      {},
      {
        plan: vi.fn(async () => plan),
        loadConfig: () => ({
          vision: {
            provider: "openai-compatible",
            baseUrl: "https://api.example.com/v1",
            apiKey: "sk-test",
            model: "gpt-4o-mini",
            timeoutMs: 60_000,
            maxImageMb: 10,
            maxOutputTokens: 4_000,
          },
          atlas: {
            allowedDirs: ["."],
            storeHistory: false,
            logLevel: "info",
            logImageContent: false,
            redactSecrets: true,
            defaultDetailLevel: "standard",
          },
        }),
        execute,
      },
    );

    expect(execute).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        config: expect.objectContaining({
          atlas: expect.objectContaining({
            allowedDirs: ["."],
          }),
        }),
      }),
    );
  });

  it("executes planned calls and injects evidence", async () => {
    const plan: ImageInterceptPlan = {
      shouldIntercept: true,
      reason: "No native vision.",
      capabilities: null,
      images: [{ path: "./shot.png", source: "path", start: 0, end: 10 }],
      plannedCalls: [
        {
          tool: "analyze_image",
          imagePath: "./shot.png",
          args: { image_path: "./shot.png", mode: "general" },
          reason: "default",
        },
      ],
    };

    const result = await interceptImagesForTextModel(
      {
        mainModelRef: "deepseek/deepseek-v4-flash",
        messageText: "check ./shot.png",
      },
      {},
      {
        plan: vi.fn(async () => plan),
        loadConfig: () => ({
          vision: {
            provider: "openai-compatible",
            baseUrl: "https://api.example.com/v1",
            apiKey: "sk-test",
            model: "gpt-4o-mini",
            timeoutMs: 60_000,
            maxImageMb: 10,
            maxOutputTokens: 4_000,
          },
          atlas: {
            allowedDirs: ["."],
            storeHistory: false,
            logLevel: "info",
            logImageContent: false,
            redactSecrets: true,
            defaultDetailLevel: "standard",
          },
        }),
        execute: vi.fn(async () => ({
          tool: "analyze_image",
          imagePath: "./shot.png",
          markdown: "## Summary\nButton visible.",
        })),
      },
    );

    expect(result.intercepted).toBe(true);
    expect(result.evidenceBlocks).toHaveLength(1);
    expect(result.messageText).toContain("check ./shot.png");
    expect(result.messageText).toContain("<atlas-vision-evidence>");
    expect(result.messageText).toContain("Button visible.");
  });
});
