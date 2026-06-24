import { describe, expect, it } from "vitest";
import {
  buildInjectedVisionContext,
  planImageIntercept,
  shouldAutoInterceptVision,
} from "../../src/capabilities/image-intercept.js";

const sampleCatalog = {
  providers: {
    deepseek: {
      models: {
        "deepseek-v4-flash": {
          attachment: false,
          modalities: { input: ["text"], output: ["text"] },
        },
      },
    },
    openai: {
      models: {
        "gpt-4o-mini": {
          attachment: true,
          modalities: { input: ["text", "image"], output: ["text"] },
        },
      },
    },
  },
};

describe("shouldAutoInterceptVision", () => {
  it("intercepts for no-vision models with images", () => {
    expect(shouldAutoInterceptVision(false, true)).toBe(true);
  });

  it("skips for vision-capable models", () => {
    expect(shouldAutoInterceptVision(true, true)).toBe(false);
  });

  it("honors force and skip flags", () => {
    expect(shouldAutoInterceptVision(true, true, { forceIntercept: true })).toBe(true);
    expect(shouldAutoInterceptVision(false, true, { skipIntercept: true })).toBe(false);
  });
});

describe("planImageIntercept", () => {
  it("plans atlas calls for text-only models", async () => {
    const plan = await planImageIntercept(
      {
        mainModelRef: "deepseek/deepseek-v4-flash",
        messageText: "Please read ./terminal.png and fix the stack trace.",
      },
      {},
      {
        cacheDir: "/tmp/unused",
        fetch: async () =>
          new Response(JSON.stringify(sampleCatalog), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      },
    );

    expect(plan.shouldIntercept).toBe(true);
    expect(plan.images).toHaveLength(1);
    expect(plan.plannedCalls[0]?.tool).toBe("ocr_image");
    expect(plan.capabilities?.supportsVision).toBe(false);
  });

  it("does not intercept for vision models", async () => {
    const plan = await planImageIntercept(
      {
        mainModelRef: "openai/gpt-4o-mini",
        messageText: "Check ./ui.png",
      },
      {},
      {
        fetch: async () =>
          new Response(JSON.stringify(sampleCatalog), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      },
    );

    expect(plan.shouldIntercept).toBe(false);
    expect(plan.plannedCalls).toHaveLength(0);
    expect(plan.capabilities?.supportsVision).toBe(true);
  });

  it("does not intercept when runtime model reports native vision", async () => {
    const plan = await planImageIntercept({
      mainModelRef: "deepseek/deepseek-v4-flash",
      messageText: "Check ./ui.png",
      runtimeSupportsVision: true,
    });

    expect(plan.shouldIntercept).toBe(false);
    expect(plan.plannedCalls).toHaveLength(0);
    expect(plan.capabilities?.source).toBe("override");
  });

  it("returns no plan when no images are present", async () => {
    const plan = await planImageIntercept(
      {
        mainModelRef: "deepseek/deepseek-v4-flash",
        messageText: "fix the login form",
      },
      {},
      {
        fetch: async () =>
          new Response(JSON.stringify(sampleCatalog), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      },
    );

    expect(plan.shouldIntercept).toBe(false);
    expect(plan.images).toHaveLength(0);
  });
});

describe("buildInjectedVisionContext", () => {
  it("wraps markdown evidence for harness injection", () => {
    const text = buildInjectedVisionContext("./shot.png", "## Summary\nA red button.");
    expect(text).toContain("<atlas-vision-evidence>");
    expect(text).toContain("Image: ./shot.png");
    expect(text).toContain("A red button.");
    expect(text).toContain("untrusted visual context");
  });
});
