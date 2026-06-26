import { describe, expect, it } from "vitest";
import {
  inferUpstreamProviderFromModelId,
  isProxyProvider,
  normalizeProviderId,
  resolveCapabilityLookup,
} from "../../src/capabilities/proxy-resolver.js";

describe("normalizeProviderId", () => {
  it("maps zhipuai and glm aliases to zai", () => {
    expect(normalizeProviderId("zhipuai")).toBe("zai");
    expect(normalizeProviderId("glm")).toBe("zai");
    expect(normalizeProviderId("z.ai")).toBe("zai");
  });
});

describe("isProxyProvider", () => {
  it("detects proxy providers", () => {
    expect(isProxyProvider("cursor")).toBe(true);
    expect(isProxyProvider("opencode-go")).toBe(true);
    expect(isProxyProvider("deepseek")).toBe(false);
  });
});

describe("inferUpstreamProviderFromModelId", () => {
  it("infers upstream from model id prefixes", () => {
    expect(inferUpstreamProviderFromModelId("composer-2.5")).toBe("cursor");
    expect(inferUpstreamProviderFromModelId("gpt-5.5")).toBe("openai");
    expect(inferUpstreamProviderFromModelId("claude-opus-4")).toBe("anthropic");
    expect(inferUpstreamProviderFromModelId("deepseek-v4-flash")).toBe("deepseek");
    expect(inferUpstreamProviderFromModelId("glm-5.2")).toBe("zai");
  });
});

describe("resolveCapabilityLookup", () => {
  it("passes through non-proxy refs with alias normalization", () => {
    expect(resolveCapabilityLookup({ mainModelRef: "zhipuai/glm-5.2" }).lookup).toEqual({
      providerId: "zai",
      modelId: "glm-5.2",
    });
  });

  it("matches composer proxy patterns before MAIN_MODEL_REF override", () => {
    const result = resolveCapabilityLookup({
      mainModelRef: "cursor/composer-2.5",
      env: { MAIN_MODEL_REF: "openai/gpt-4o" },
    });

    expect(result.resolutionSource).toBe("proxy-pattern");
    expect(result.proxySupportsVision).toBe(true);
    expect(result.lookup).toEqual({ providerId: "cursor", modelId: "composer-2.5" });
  });

  it("regression: composer skips MAIN_MODEL_REF text-only override", () => {
    const result = resolveCapabilityLookup({
      mainModelRef: "cursor/composer-2.5",
      env: { MAIN_MODEL_REF: "deepseek/deepseek-v4-flash" },
    });

    expect(result.resolutionSource).toBe("proxy-pattern");
    expect(result.proxySupportsVision).toBe(true);
  });

  it("uses MAIN_MODEL_REF for unknown proxy models", () => {
    const result = resolveCapabilityLookup({
      mainModelRef: "cursor/custom-route",
      env: { MAIN_MODEL_REF: "openai/gpt-4o" },
    });

    expect(result.lookup).toEqual({ providerId: "openai", modelId: "gpt-4o" });
    expect(result.resolutionSource).toBe("main-model-ref");
  });

  it("uses CURSOR_UNDERLYING_MODEL when MAIN_MODEL_REF matches hook ref", () => {
    const result = resolveCapabilityLookup({
      mainModelRef: "cursor/custom-route",
      env: {
        MAIN_MODEL_REF: "cursor/custom-route",
        CURSOR_UNDERLYING_MODEL: "openai/gpt-4o",
      },
    });

    expect(result.lookup).toEqual({ providerId: "openai", modelId: "gpt-4o" });
    expect(result.resolutionSource).toBe("underlying-model-env");
  });

  it("matches composer proxy patterns as vision-native", () => {
    const result = resolveCapabilityLookup({
      mainModelRef: "cursor/composer-2.5",
      env: {},
    });

    expect(result.resolutionSource).toBe("proxy-pattern");
    expect(result.proxySupportsVision).toBe(true);
  });

  it("infers upstream for proxy deepseek models", () => {
    const result = resolveCapabilityLookup({
      mainModelRef: "opencode-go/deepseek-v4-flash",
      env: {},
    });

    expect(result.lookup).toEqual({
      providerId: "deepseek",
      modelId: "deepseek-v4-flash",
    });
    expect(result.resolutionSource).toBe("upstream-inference");
  });

  it("infers upstream for proxy gpt models", () => {
    const result = resolveCapabilityLookup({
      mainModelRef: "cursor/gpt-5.5",
      env: {},
    });

    expect(result.lookup).toEqual({ providerId: "openai", modelId: "gpt-5.5" });
    expect(result.resolutionSource).toBe("upstream-inference");
  });
});
