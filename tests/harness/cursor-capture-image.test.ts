import { describe, expect, it } from "vitest";
import {
  extractCapturedImagePath,
  runCursorCaptureImageHook,
} from "../../src/harness/cursor-capture-image.js";
import {
  appendSessionImage,
  consumeSessionImages,
  isImageFilePath,
} from "../../src/harness/session-images.js";

describe("isImageFilePath", () => {
  it("detects common image extensions", () => {
    expect(isImageFilePath("./shot.png")).toBe(true);
    expect(isImageFilePath("./readme.md")).toBe(false);
  });
});

describe("extractCapturedImagePath", () => {
  it("captures Cursor asset writes", () => {
    const path = extractCapturedImagePath({
      tool_name: "Write",
      tool_input: {
        file_path: "/repo/.cursor/projects/foo/assets/image-123.png",
      },
    });
    expect(path).toContain("image-123.png");
  });

  it("ignores non-image writes", () => {
    expect(
      extractCapturedImagePath({
        tool_name: "Write",
        tool_input: { file_path: "/repo/src/index.ts" },
      }),
    ).toBeNull();
  });
});

describe("session image store", () => {
  it("appends and consumes session images", async () => {
    await appendSessionImage("session-1", "/tmp/a.png");
    await appendSessionImage("session-1", "/tmp/b.png");
    expect(await consumeSessionImages("session-1")).toEqual(["/tmp/a.png", "/tmp/b.png"]);
    expect(await consumeSessionImages("session-1")).toEqual([]);
  });
});

describe("runCursorCaptureImageHook", () => {
  it("stores image path from postToolUse payload", async () => {
    const captured = await runCursorCaptureImageHook(
      JSON.stringify({
        session_id: "cursor-session",
        tool_name: "Write",
        tool_input: {
          file_path: "/repo/.cursor/projects/foo/assets/image-abc.png",
        },
      }),
    );

    expect(captured).toBe(true);
    const paths = await consumeSessionImages("cursor-session");
    expect(paths).toEqual(["/repo/.cursor/projects/foo/assets/image-abc.png"]);
  });
});
