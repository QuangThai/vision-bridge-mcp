import { describe, expect, it } from "vitest";
import { planImageIntercept } from "../../src/capabilities/image-intercept.js";

describe("pi extension smoke test - runtimeSupportsVision", () => {
  it("skips intercept when runtimeSupportsVision=true (gpt-5.5 case)", async () => {
    const plan = await planImageIntercept({
      mainModelRef: "openai/gpt-5.5",
      messageText: "check ./test.png",
      runtimeSupportsVision: true,
    });
    expect(plan.shouldIntercept).toBe(false);
    expect(plan.reason).toContain("native vision");
  });

  it("intercepts when runtimeSupportsVision=false (deepseek case)", async () => {
    const plan = await planImageIntercept({
      mainModelRef: "deepseek/deepseek-v4-flash",
      messageText: "check ./test.png",
      runtimeSupportsVision: false,
    });
    expect(plan.shouldIntercept).toBe(true);
  });

  it("handles openai-codex with vision via heuristic when runtime is unknown", async () => {
    const plan = await planImageIntercept({
      mainModelRef: "openai-codex/gpt-5.5",
      messageText: "check ./test.png",
      // runtimeSupportsVision is undefined -> fallthrough to heuristic
    });
    expect(plan.shouldIntercept).toBe(false);
    expect(plan.capabilities?.supportsVision).toBe(true);
    expect(plan.capabilities?.source).toBe("heuristic");
  });

  it("handles opencode-go/deepseek via unknown fallback (safe default)", async () => {
    const plan = await planImageIntercept({
      mainModelRef: "opencode-go/deepseek-v4-flash",
      messageText: "check ./test.png",
      // runtimeSupportsVision is undefined -> fallthrough to unknown
    });
    // opencode-go is NOT in heuristic (mixed models), and NOT in models.dev -> "unknown" -> false
    expect(plan.shouldIntercept).toBe(true);
    expect(plan.capabilities?.source).toBe("unknown");
  });

  it("handles opencode/minimax-m3 via unknown fallback (safe default)", async () => {
    const plan = await planImageIntercept({
      mainModelRef: "opencode/minimax-m3-free",
      messageText: "check ./test.png",
    });
    expect(plan.shouldIntercept).toBe(true);
    expect(plan.capabilities?.supportsVision).toBe(false);
  });

  it("detects zai/glm-5v-turbo as vision model", async () => {
    const plan = await planImageIntercept({
      mainModelRef: "zai/glm-5v-turbo",
      messageText: "check ./test.png",
    });
    expect(plan.shouldIntercept).toBe(false);
    expect(plan.capabilities?.supportsVision).toBe(true);
    expect(plan.capabilities?.source).toBe("bundled");
  });

  it("detects zai/glm-5.2 as text-only", async () => {
    const plan = await planImageIntercept({
      mainModelRef: "zai/glm-5.2",
      messageText: "check ./test.png",
    });
    expect(plan.shouldIntercept).toBe(true);
    expect(plan.capabilities?.supportsVision).toBe(false);
    expect(plan.capabilities?.source).toBe("bundled");
  });
});
