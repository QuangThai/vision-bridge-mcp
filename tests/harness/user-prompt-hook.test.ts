import { describe, expect, it, vi } from "vitest";
import { appendSessionImage } from "../../src/harness/session-images.js";
import {
  collectAttachmentPaths,
  detectHookClient,
  extractRuntimeSupportsVision,
  formatUserPromptHookOutput,
  parseUserPromptHookInput,
  resolveMainModelRef,
  runUserPromptHook,
} from "../../src/harness/user-prompt-hook.js";

describe("detectHookClient", () => {
  it("maps Cursor beforeSubmitPrompt to cursor client", () => {
    expect(detectHookClient("beforeSubmitPrompt")).toBe("cursor");
  });

  it("prefers explicit client override", () => {
    expect(detectHookClient("UserPromptSubmit", "droid")).toBe("droid");
  });
});

describe("formatUserPromptHookOutput", () => {
  it("formats Cursor additional_context", () => {
    const output = formatUserPromptHookOutput("cursor", "evidence");
    expect(JSON.parse(output)).toEqual({ additional_context: "evidence" });
  });

  it("formats Claude hookSpecificOutput", () => {
    const output = formatUserPromptHookOutput("claude", "evidence");
    expect(JSON.parse(output)).toEqual({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: "evidence",
      },
    });
  });

  it("formats Codex hookSpecificOutput", () => {
    const output = formatUserPromptHookOutput("codex", "evidence");
    expect(JSON.parse(output)).toEqual({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: "evidence",
      },
    });
  });
});

describe("resolveMainModelRef", () => {
  it("prefers explicit MAIN_MODEL_REF env", () => {
    expect(
      resolveMainModelRef(
        { model: "deepseek-v4-flash" },
        { MAIN_MODEL_REF: "deepseek/deepseek-v4-pro" },
      ),
    ).toBe("deepseek/deepseek-v4-pro");
  });

  it("builds models.dev ref from Codex hook model slug", () => {
    expect(
      resolveMainModelRef({ model: "deepseek-v4-flash", hook_event_name: "UserPromptSubmit" }, {}),
    ).toBe("deepseek/deepseek-v4-flash");
  });

  it("uses MAIN_MODEL_PROVIDER for custom Codex provider routes", () => {
    expect(
      resolveMainModelRef(
        { model: "glm-5.2", hook_event_name: "UserPromptSubmit" },
        { MAIN_MODEL_PROVIDER: "glm" },
      ),
    ).toBe("zai/glm-5.2");
  });
});

describe("extractRuntimeSupportsVision", () => {
  it("reads supports_vision from hook JSON", () => {
    expect(extractRuntimeSupportsVision({ supports_vision: true }, {})).toBe(true);
    expect(extractRuntimeSupportsVision({ supports_vision: false }, {})).toBe(false);
  });

  it("reads input_modalities from hook JSON", () => {
    expect(extractRuntimeSupportsVision({ input_modalities: ["text", "image"] }, {})).toBe(true);
    expect(extractRuntimeSupportsVision({ input_modalities: ["text"] }, {})).toBe(false);
  });

  it("prefers explicit option override", () => {
    expect(
      extractRuntimeSupportsVision({ supports_vision: false }, { runtimeSupportsVision: true }),
    ).toBe(true);
  });
});

describe("collectAttachmentPaths", () => {
  it("collects file paths from attachments", () => {
    expect(
      collectAttachmentPaths([
        { type: "file", path: "./design.png" },
        { file_path: "/tmp/shot.png" },
      ]),
    ).toEqual(["./design.png", "/tmp/shot.png"]);
  });
});

describe("parseUserPromptHookInput", () => {
  it("parses JSON stdin", () => {
    expect(
      parseUserPromptHookInput(JSON.stringify({ prompt: "fix ./a.png", cwd: "/repo" })),
    ).toEqual({ prompt: "fix ./a.png", cwd: "/repo" });
  });

  it("falls back to raw prompt text", () => {
    expect(parseUserPromptHookInput("fix ./a.png")).toEqual({ prompt: "fix ./a.png" });
  });
});

describe("runUserPromptHook", () => {
  it("returns empty stdout when intercept is skipped", async () => {
    const result = await runUserPromptHook(JSON.stringify({ prompt: "fix ./a.png" }), {
      mainModelRef: "deepseek/deepseek-v4-flash",
      skipIntercept: true,
    });

    expect(result.intercepted).toBe(false);
    expect(result.stdout).toBe("");
  });

  it("injects evidence for text-only models with image paths", async () => {
    const result = await runUserPromptHook(
      JSON.stringify({
        prompt: "fix ./screenshots/error.png",
        hook_event_name: "beforeSubmitPrompt",
        cwd: "/repo",
      }),
      {
        mainModelRef: "deepseek/deepseek-v4-flash",
        env: {
          VISION_API_KEY: "test",
        },
      },
      {
        plan: vi.fn(async () => ({
          shouldIntercept: true,
          reason: "no vision",
          capabilities: {
            modelId: "deepseek-v4-flash",
            providerId: "deepseek",
            supportsVision: false,
            supportsTools: true,
            supportsReasoning: false,
            inputModalities: ["text"],
            outputModalities: ["text"],
            contextWindow: 0,
            maxOutputTokens: 0,
            source: "override",
          },
          images: [{ path: "./screenshots/error.png", source: "path" }],
          plannedCalls: [
            {
              tool: "analyze_image",
              imagePath: "./screenshots/error.png",
              mode: "error_screenshot",
            },
          ],
        })),
        execute: vi.fn(async () => ({
          imagePath: "./screenshots/error.png",
          markdown: "## Summary\nError dialog visible.",
        })),
        loadConfig: vi.fn(() => ({
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
        })),
        cwd: "/repo",
      },
    );

    expect(result.intercepted).toBe(true);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.additional_context).toContain("<atlas-vision-evidence>");
    expect(parsed.additional_context).toContain("Error dialog visible.");
  });

  it("consumes pending session images captured from Cursor postToolUse", async () => {
    await appendSessionImage("cursor-1", "/repo/.cursor/projects/foo/assets/image-1.png");

    const result = await runUserPromptHook(
      JSON.stringify({
        prompt: "describe this screenshot",
        session_id: "cursor-1",
        hook_event_name: "beforeSubmitPrompt",
        cwd: "/repo",
      }),
      {
        mainModelRef: "deepseek/deepseek-v4-flash",
        env: { VISION_API_KEY: "test" },
      },
      {
        plan: vi.fn(async (_input, _options, _modelsDev) => ({
          shouldIntercept: true,
          reason: "no vision",
          capabilities: {
            modelId: "deepseek-v4-flash",
            providerId: "deepseek",
            supportsVision: false,
            supportsTools: true,
            supportsReasoning: false,
            inputModalities: ["text"],
            outputModalities: ["text"],
            contextWindow: 0,
            maxOutputTokens: 0,
            source: "override",
          },
          images: [
            {
              path: "/repo/.cursor/projects/foo/assets/image-1.png",
              source: "path",
            },
          ],
          plannedCalls: [
            {
              tool: "analyze_image",
              imagePath: "/repo/.cursor/projects/foo/assets/image-1.png",
              mode: "general",
            },
          ],
        })),
        execute: vi.fn(async () => ({
          imagePath: "/repo/.cursor/projects/foo/assets/image-1.png",
          markdown: "## Summary\nUI visible.",
        })),
        loadConfig: vi.fn(() => ({
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
        })),
        cwd: "/repo",
      },
    );

    expect(result.intercepted).toBe(true);
  });
});
