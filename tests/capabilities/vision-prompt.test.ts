import { describe, expect, it } from "vitest";
import { buildVisionInstructionsPrompt } from "../../src/capabilities/vision-prompt.js";

describe("buildVisionInstructionsPrompt", () => {
  it("documents atlas tool routing for text-only agents", () => {
    const prompt = buildVisionInstructionsPrompt();
    expect(prompt).toContain("analyze_image");
    expect(prompt).toContain("ocr_image");
    expect(prompt).toContain("analyze_ui_screenshot");
    expect(prompt).toContain("untrusted evidence");
  });
});
