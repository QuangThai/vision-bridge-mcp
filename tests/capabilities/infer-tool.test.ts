import { describe, expect, it } from "vitest";
import { inferVisionTool, planVisionCalls } from "../../src/capabilities/infer-tool.js";

describe("inferVisionTool", () => {
  it("routes terminal screenshots to ocr_image", () => {
    const result = inferVisionTool("read the terminal output", "./terminal.png");
    expect(result.tool).toBe("ocr_image");
    expect(result.args.preserve_layout).toBe(true);
  });

  it("routes ui review to analyze_ui_screenshot", () => {
    const result = inferVisionTool("review this navbar layout", "./ui.png");
    expect(result.tool).toBe("analyze_ui_screenshot");
    expect(result.args.goal).toBe("describe");
  });

  it("routes compare language to compare_images", () => {
    const result = inferVisionTool("compare before and after screenshots", "./after.png");
    expect(result.tool).toBe("compare_images");
  });

  it("defaults to analyze_image", () => {
    const result = inferVisionTool("what is in this image", "./photo.jpg");
    expect(result.tool).toBe("analyze_image");
    expect(result.args.mode).toBe("general");
  });
});

describe("planVisionCalls", () => {
  it("creates one planned call per image", () => {
    const calls = planVisionCalls("ocr this terminal.png", ["./a.png", "./b.png"]);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.tool).toBe("ocr_image");
    expect(calls[0]?.args.image_path).toBe("./a.png");
  });
});
