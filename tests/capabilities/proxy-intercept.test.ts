import { describe, expect, it } from "vitest";
import { planImageIntercept } from "../../src/capabilities/image-intercept.js";

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
        "gpt-4o": {
          attachment: true,
          modalities: { input: ["text", "image"], output: ["text"] },
        },
        "gpt-4o-mini": {
          attachment: true,
          modalities: { input: ["text", "image"], output: ["text"] },
        },
      },
    },
  },
};

const mockFetch = async () =>
  new Response(JSON.stringify(sampleCatalog), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("planImageIntercept proxy routing", () => {
  it("skips intercept for cursor/composer-2.5 via proxy pattern", async () => {
    const plan = await planImageIntercept(
      {
        mainModelRef: "cursor/composer-2.5",
        messageText: "check ./image.png",
        env: { ATLAS_FORCE_INTERCEPT: "false" },
      },
      {},
      { cacheDir: "/tmp/unused", fetch: mockFetch },
    );

    expect(plan.shouldIntercept).toBe(false);
    expect(plan.capabilities?.supportsVision).toBe(true);
  });

  it("intercepts for opencode-go/deepseek-v4-flash via upstream inference", async () => {
    const plan = await planImageIntercept(
      {
        mainModelRef: "opencode-go/deepseek-v4-flash",
        messageText: "check ./image.png",
      },
      {},
      { cacheDir: "/tmp/unused", fetch: mockFetch },
    );

    expect(plan.shouldIntercept).toBe(true);
    expect(plan.capabilities?.supportsVision).toBe(false);
  });

  it("skips intercept when MAIN_MODEL_REF is text-only but hook model is composer", async () => {
    const plan = await planImageIntercept(
      {
        mainModelRef: "cursor/composer-2.5",
        messageText: "check ./image.png",
        env: {
          MAIN_MODEL_REF: "deepseek/deepseek-v4-flash",
          ATLAS_FORCE_INTERCEPT: "false",
        },
      },
      {},
      { cacheDir: "/tmp/unused", fetch: mockFetch },
    );

    expect(plan.shouldIntercept).toBe(false);
    expect(plan.capabilities?.supportsVision).toBe(true);
  });

  it("skips intercept when MAIN_MODEL_REF resolves proxy to vision model", async () => {
    const plan = await planImageIntercept(
      {
        mainModelRef: "cursor/composer-2.5",
        messageText: "check ./image.png",
        env: { MAIN_MODEL_REF: "openai/gpt-4o" },
      },
      {},
      { fetch: mockFetch },
    );

    expect(plan.shouldIntercept).toBe(false);
    expect(plan.capabilities?.supportsVision).toBe(true);
  });

  it("intercepts for zhipuai/glm-5.2 via provider alias", async () => {
    const plan = await planImageIntercept(
      {
        mainModelRef: "zhipuai/glm-5.2",
        messageText: "check ./image.png",
      },
      {},
      { cacheDir: "/tmp/unused", fetch: mockFetch },
    );

    expect(plan.shouldIntercept).toBe(true);
    expect(plan.capabilities?.source).toBe("bundled");
  });

  it("skips intercept when hook sends supports_vision runtime signal", async () => {
    const plan = await planImageIntercept({
      mainModelRef: "cursor/composer-2.5",
      messageText: "check ./image.png",
      runtimeSupportsVision: true,
    });

    expect(plan.shouldIntercept).toBe(false);
    expect(plan.capabilities?.source).toBe("override");
  });

  it("skips intercept for cursor/gpt-5.5 via upstream openai inference", async () => {
    const plan = await planImageIntercept(
      {
        mainModelRef: "cursor/gpt-5.5",
        messageText: "check ./image.png",
        env: {},
      },
      {},
      { cacheDir: "/tmp/unused", fetch: mockFetch },
    );

    expect(plan.shouldIntercept).toBe(false);
    expect(plan.capabilities?.supportsVision).toBe(true);
  });
});
