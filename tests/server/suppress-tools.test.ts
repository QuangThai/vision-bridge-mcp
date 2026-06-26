import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModelCapabilities } from "../../src/capabilities/types.js";

// Mock getModelCapabilities + parseModelRef
vi.mock("../../src/capabilities/index.js", () => ({
  getModelCapabilities: vi.fn(),
  parseModelRef: vi.fn((ref: string) => {
    const slash = ref.indexOf("/");
    if (slash === -1) return { providerId: "unknown", modelId: ref };
    return {
      providerId: ref.slice(0, slash),
      modelId: ref.slice(slash + 1),
    };
  }),
}));

import { getModelCapabilities } from "../../src/capabilities/index.js";
import { shouldSuppressVisionTools } from "../../src/server.js";

const mockGetModelCapabilities = vi.mocked(getModelCapabilities);

describe("shouldSuppressVisionTools", () => {
  afterEach(() => {
    mockGetModelCapabilities.mockReset();
  });

  it("returns false when MAIN_MODEL_REF is not set", async () => {
    const result = await shouldSuppressVisionTools({});
    expect(result).toBe(false);
    expect(mockGetModelCapabilities).not.toHaveBeenCalled();
  });

  it("returns true when MAIN_MODEL_REF model has vision", async () => {
    mockGetModelCapabilities.mockResolvedValue({
      supportsVision: true,
    } as ModelCapabilities);

    const result = await shouldSuppressVisionTools(
      { MAIN_MODEL_REF: "openai/gpt-4o" },
    );
    expect(result).toBe(true);
    expect(mockGetModelCapabilities).toHaveBeenCalledOnce();
  });

  it("returns false when MAIN_MODEL_REF model is text-only", async () => {
    mockGetModelCapabilities.mockResolvedValue({
      supportsVision: false,
    } as ModelCapabilities);

    const result = await shouldSuppressVisionTools(
      { MAIN_MODEL_REF: "deepseek/deepseek-v4-flash" },
    );
    expect(result).toBe(false);
  });

  it("returns false on lookup failure (safe default)", async () => {
    mockGetModelCapabilities.mockRejectedValue(new Error("Network error"));

    const result = await shouldSuppressVisionTools(
      { MAIN_MODEL_REF: "unknown/provider" },
    );
    expect(result).toBe(false);
  });

  it("passes MAIN_MODEL_PROVIDER to parseModelRef", async () => {
    mockGetModelCapabilities.mockResolvedValue({
      supportsVision: true,
    } as ModelCapabilities);

    // parseModelRef mock doesn't use providerId directly, but the call should proceed
    const result = await shouldSuppressVisionTools({
      MAIN_MODEL_REF: "custom-model",
      MAIN_MODEL_PROVIDER: "openai",
    });
    // Should resolve based on getModelCapabilities result
    expect(result).toBe(true);
  });
});
