import { describe, expect, it, vi } from "vitest";
import { ProviderError } from "../../src/providers/errors.js";
import { FallbackVisionProvider } from "../../src/providers/fallback.js";
import type {
  AnalyzeImageInput,
  CompareImagesInput,
  ProviderHealth,
  RawVisionResult,
  VisionProvider,
} from "../../src/providers/types.js";

// ---------------------------------------------------------------------------
// Mock providers
// ---------------------------------------------------------------------------

/** A primary provider that fails with a transient (network) error N times. */
function transientPrimary(name: string, failCount = 1): VisionProvider {
  let callIndex = 0;
  return {
    name,
    analyzeImage: vi.fn(async (_input: AnalyzeImageInput): Promise<RawVisionResult> => {
      callIndex++;
      if (callIndex <= failCount) {
        throw new ProviderError("timeout: upstream not reachable", "timeout");
      }
      return { text: `${name} result`, provider: name, model: "mock", raw: {} };
    }),
    compareImages: vi.fn(async (_input: CompareImagesInput): Promise<RawVisionResult> => {
      callIndex++;
      if (callIndex <= failCount) {
        throw new ProviderError("timeout: upstream not reachable", "timeout");
      }
      return { text: `${name} compare`, provider: name, model: "mock", raw: {} };
    }),
    healthCheck: vi.fn(async (): Promise<ProviderHealth> => {
      return { ok: callIndex === 0, provider: name, model: "mock" };
    }),
  };
}

function healthyProvider(name: string): VisionProvider {
  return {
    name,
    analyzeImage: vi.fn(async (_input: AnalyzeImageInput): Promise<RawVisionResult> => {
      return { text: `${name} result`, provider: name, model: "mock", raw: {} };
    }),
    compareImages: vi.fn(async (_input: CompareImagesInput): Promise<RawVisionResult> => {
      return { text: `${name} compare`, provider: name, model: "mock", raw: {} };
    }),
    healthCheck: vi.fn(async (): Promise<ProviderHealth> => {
      return { ok: true, provider: name, model: "mock" };
    }),
  };
}

function makeInput(): AnalyzeImageInput {
  return {
    image: { mimeType: "image/png", base64: "fake" },
    userPrompt: "describe this",
  };
}

function makeCompareInput(): CompareImagesInput {
  return {
    before: { mimeType: "image/png", base64: "before" },
    after: { mimeType: "image/png", base64: "after" },
    userPrompt: "compare",
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FallbackVisionProvider", () => {
  it("delegates to primary on success", async () => {
    const primary = healthyProvider("primary");
    const fallback = healthyProvider("fallback");
    const fvp = new FallbackVisionProvider(primary, fallback);

    const result = await fvp.analyzeImage(makeInput());

    expect(result.text).toBe("primary result");
    expect(result._fallbackUsed).toBe(false);
    expect(primary.analyzeImage).toHaveBeenCalledTimes(1);
    expect(fallback.analyzeImage).toHaveBeenCalledTimes(0);
  });

  it("falls back to secondary when primary fails with transient error", async () => {
    const primary = transientPrimary("primary", 1);
    const fallback = healthyProvider("fallback");
    const fvp = new FallbackVisionProvider(primary, fallback);

    const result = await fvp.analyzeImage(makeInput());

    expect(result.text).toBe("fallback result");
    expect(result._fallbackUsed).toBe(true);
    expect(primary.analyzeImage).toHaveBeenCalledTimes(1);
    expect(fallback.analyzeImage).toHaveBeenCalledTimes(1);
  });

  it("does NOT fall back on non-transient (auth) errors", async () => {
    const noAuth: VisionProvider = {
      name: "no-auth",
      analyzeImage: vi.fn(async () => {
        throw new ProviderError("401 Unauthorized", "authentication");
      }),
      compareImages: vi.fn(async () => {
        throw new ProviderError("401 Unauthorized", "authentication");
      }),
      healthCheck: vi.fn(async () => ({ ok: false, provider: "no-auth", model: "mock" })),
    };
    const fallback = healthyProvider("fallback");
    const fvp = new FallbackVisionProvider(noAuth, fallback);

    await expect(fvp.analyzeImage(makeInput())).rejects.toThrow(/401/);
    expect(fallback.analyzeImage).toHaveBeenCalledTimes(0);
  });

  it("falls back on timeout errors", async () => {
    const timeout = transientPrimary("timeout", 1);
    const fallback = healthyProvider("fallback");
    const fvp = new FallbackVisionProvider(timeout, fallback);

    const result = await fvp.analyzeImage(makeInput());
    expect(result._fallbackUsed).toBe(true);
    expect(result.text).toBe("fallback result");
  });

  it("falls back on rate limit (429) errors", async () => {
    const rateLimited: VisionProvider = {
      name: "rate-limited",
      analyzeImage: vi.fn(async () => {
        throw new ProviderError("429 Too Many Requests", "rate_limit");
      }),
      compareImages: vi.fn(async () => {
        throw new ProviderError("429 Too Many Requests", "rate_limit");
      }),
      healthCheck: vi.fn(async () => ({ ok: false, provider: "rate-limited", model: "mock" })),
    };
    const fallback = healthyProvider("fallback");
    const fvp = new FallbackVisionProvider(rateLimited, fallback);

    const result = await fvp.analyzeImage(makeInput());
    expect(result._fallbackUsed).toBe(true);
  });

  it("falls back on network errors (ECONNREFUSED)", async () => {
    const noNet: VisionProvider = {
      name: "no-net",
      analyzeImage: vi.fn(async () => {
        throw new ProviderError("connect ECONNREFUSED", "network");
      }),
      compareImages: vi.fn(async () => {
        throw new ProviderError("connect ECONNREFUSED", "network");
      }),
      healthCheck: vi.fn(async () => ({ ok: false, provider: "no-net", model: "mock" })),
    };
    const fallback = healthyProvider("fallback");
    const fvp = new FallbackVisionProvider(noNet, fallback);

    const result = await fvp.analyzeImage(makeInput());
    expect(result._fallbackUsed).toBe(true);
  });

  it("throws primary error when both providers fail", async () => {
    const primary = transientPrimary("primary", 1);
    const failingFallback: VisionProvider = {
      name: "fallback",
      analyzeImage: vi.fn(async () => {
        throw new Error("fallback also dead");
      }),
      compareImages: vi.fn(async () => {
        throw new Error("fallback also dead");
      }),
      healthCheck: vi.fn(async () => ({ ok: false, provider: "fallback", model: "mock" })),
    };
    const fvp = new FallbackVisionProvider(primary, failingFallback);

    await expect(fvp.analyzeImage(makeInput())).rejects.toThrow(/upstream not reachable/);
  });

  it("handles compareImages with fallback", async () => {
    const primary = transientPrimary("primary", 1);
    const fallback = healthyProvider("fallback");
    const fvp = new FallbackVisionProvider(primary, fallback);

    const result = await fvp.compareImages(makeCompareInput());
    expect(result._fallbackUsed).toBe(true);
    expect(result.text).toBe("fallback compare");
  });
});
