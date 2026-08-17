import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createReadTool } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type { ImageInterceptPlan } from "../../src/capabilities/types.js";
import type { AtlasConfig } from "../../src/config.js";
import {
  type ToolResultContentPart,
  interceptToolResultImage,
} from "../../src/harness/tool-result-intercept.js";

const PNG_DATA =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("Pi read tool-result interception", () => {
  it("converts the official Pi read image result with one Atlas call", async () => {
    const projectDir = await mkdtemp(join(tmpdir(), "atlas-pi-read-"));
    const imagePath = join(projectDir, "screenshot.png");
    await writeFile(imagePath, Buffer.from(PNG_DATA, "base64"));

    try {
      const readTool = createReadTool(projectDir);
      const piResult = await readTool.execute(
        "pi-read-call",
        { path: imagePath },
        undefined,
        undefined,
      );
      expect(piResult.content.some((part) => part.type === "image")).toBe(true);

      const execute = vi.fn(async (call: { imagePath: string }) => ({
        tool: "analyze_image" as const,
        imagePath: call.imagePath,
        markdown: "Official Pi screenshot evidence.",
      }));
      const plan = vi.fn(async (input: { messageText: string }): Promise<ImageInterceptPlan> => {
        const paths = [...input.messageText.matchAll(/^Attached image: (.+)$/gmu)].map(
          (match) => match[1],
        );
        return {
          shouldIntercept: true,
          reason: "Text-only Pi model.",
          capabilities: null,
          images: paths.map((path) => ({ path, source: "path", start: 0, end: path.length })),
          plannedCalls: paths.map((path) => ({
            tool: "analyze_image",
            imagePath: path,
            args: { image_path: path, mode: "general" },
            reason: "Tool-result image.",
          })),
        };
      });

      const result = await interceptToolResultImage(
        {
          mainModelRef: "deepseek/deepseek-v4-flash",
          toolName: "read",
          toolCallId: "pi-read-call",
          toolInput: { path: imagePath },
          content: piResult.content as ToolResultContentPart[],
          isError: false,
          runtimeSupportsVision: false,
        },
        {
          cwd: projectDir,
          loadConfig: () =>
            ({
              vision: {},
              atlas: { allowedDirs: [projectDir] },
            }) as AtlasConfig,
          plan,
          execute,
        },
      );

      expect(result.intercepted).toBe(true);
      expect(result.analyzedImageCount).toBe(1);
      expect(plan).toHaveBeenCalledTimes(1);
      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute.mock.calls[0]?.[0].imagePath).not.toBe(imagePath);
    } finally {
      await rm(projectDir, { recursive: true, force: true });
    }
  });
});
