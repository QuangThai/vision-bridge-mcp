import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CostTracker, CostTrackingVisionProvider } from "../../src/capabilities/cost-tracker.js";
import type { RawVisionResult, VisionProvider } from "../../src/providers/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function testDir(): string {
  return join(tmpdir(), `atlas-cost-test-${Date.now()}`);
}

function makeResult(
  text: string,
  usage?: { prompt_tokens?: number; completion_tokens?: number },
): RawVisionResult {
  return {
    text,
    provider: "test",
    model: "gpt-4o-mini",
    raw: usage ? { usage } : { mock: true },
  };
}

// ---------------------------------------------------------------------------
// CostTracker
// ---------------------------------------------------------------------------

describe("CostTracker", () => {
  let dir: string;
  let tracker: CostTracker;

  beforeEach(() => {
    dir = testDir();
    tracker = new CostTracker({ dir });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns empty for no records", async () => {
    const entries = await tracker.readAll();
    expect(entries).toHaveLength(0);
  });

  it("records a cost entry", async () => {
    await tracker.record({
      model: "gpt-4o-mini",
      operation: "analyze_image",
      imageCount: 1,
      imageSizeBytes: 1024,
      result: makeResult("ok", { prompt_tokens: 100, completion_tokens: 50 }),
    });

    const entries = await tracker.readAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].model).toBe("gpt-4o-mini");
    expect(entries[0].operation).toBe("analyze_image");
    expect(entries[0].promptTokens).toBe(100);
    expect(entries[0].completionTokens).toBe(50);
    expect(entries[0].totalTokens).toBe(150);
  });

  it("estimates cost from token usage", async () => {
    await tracker.record({
      model: "gpt-4o-mini",
      operation: "analyze_image",
      imageCount: 1,
      imageSizeBytes: 1024,
      result: makeResult("ok", { prompt_tokens: 1000, completion_tokens: 500 }),
    });

    const entries = await tracker.readAll();
    expect(entries[0].estimatedCostUsd).toBeCloseTo(0.00045, 6);
    // 1000 * $0.15/M + 500 * $0.60/M = 0.00015 + 0.00030 = 0.00045
  });

  it("does not record when disabled", async () => {
    const disabled = new CostTracker({ dir, disabled: true });
    await disabled.record({
      model: "gpt-4o-mini",
      operation: "analyze_image",
      imageCount: 1,
      imageSizeBytes: 1024,
      result: makeResult("ok"),
    });

    const entries = await disabled.readAll();
    expect(entries).toHaveLength(0);
  });

  it("returns aggregated summary", async () => {
    await tracker.record({
      model: "gpt-4o-mini",
      operation: "analyze_image",
      imageCount: 1,
      imageSizeBytes: 100,
      result: makeResult("a", { prompt_tokens: 100, completion_tokens: 50 }),
    });
    await tracker.record({
      model: "gpt-4o",
      operation: "ocr_image",
      imageCount: 1,
      imageSizeBytes: 200,
      result: makeResult("b", { prompt_tokens: 200, completion_tokens: 100 }),
    });
    await tracker.record({
      model: "gpt-4o-mini",
      operation: "analyze_image",
      imageCount: 1,
      imageSizeBytes: 150,
      result: makeResult("c", { prompt_tokens: 50, completion_tokens: 25 }),
    });

    const summary = await tracker.summary();
    expect(summary.totalCalls).toBe(3);
    expect(summary.totalPromptTokens).toBe(350);
    expect(summary.totalCompletionTokens).toBe(175);
    expect(summary.byModel["gpt-4o-mini"].calls).toBe(2);
    expect(summary.byModel["gpt-4o"].calls).toBe(1);
  });

  it("handles unknown model pricing gracefully", async () => {
    const unknownModel = new CostTracker({ dir });
    await unknownModel.record({
      model: "unknown-model-v1",
      operation: "analyze_image",
      imageCount: 1,
      imageSizeBytes: 100,
      result: makeResult("ok", { prompt_tokens: 1000, completion_tokens: 500 }),
    });

    const entries = await unknownModel.readAll();
    expect(entries[0].estimatedCostUsd).toBeCloseTo(0.00045, 6); // uses default pricing
  });
});

// ---------------------------------------------------------------------------
// CostTrackingVisionProvider
// ---------------------------------------------------------------------------

describe("CostTrackingVisionProvider", () => {
  let dir: string;
  let tracker: CostTracker;
  let inner: VisionProvider;

  beforeEach(() => {
    dir = testDir();
    tracker = new CostTracker({ dir });
    inner = {
      name: "test-provider",
      analyzeImage: async () => makeResult("result", { prompt_tokens: 100, completion_tokens: 50 }),
      compareImages: async () =>
        makeResult("compare", { prompt_tokens: 200, completion_tokens: 80 }),
      healthCheck: async () => ({ ok: true, provider: "test", model: "test" }),
    };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("records analyze_image calls", async () => {
    const tracked = new CostTrackingVisionProvider(inner, { tracker });

    await tracked.analyzeImage({
      image: { mimeType: "image/png", base64: "abc" },
      userPrompt: "analyze",
    });

    const entries = await tracker.readAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe("analyze_image");
  });

  it("records compare_images calls", async () => {
    const tracked = new CostTrackingVisionProvider(inner, { tracker });

    await tracked.compareImages({
      before: { mimeType: "image/png", base64: "before" },
      after: { mimeType: "image/png", base64: "after" },
      userPrompt: "compare",
    });

    const entries = await tracker.readAll();
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe("compare_images");
    expect(entries[0].imageCount).toBe(2);
  });

  it("does not record when disabled", async () => {
    const tracked = new CostTrackingVisionProvider(inner, { tracker, disabled: true });

    await tracked.analyzeImage({
      image: { mimeType: "image/png", base64: "abc" },
      userPrompt: "analyze",
    });

    const entries = await tracker.readAll();
    expect(entries).toHaveLength(0);
  });

  it("does not record healthCheck", async () => {
    const tracked = new CostTrackingVisionProvider(inner, { tracker });

    await tracked.healthCheck();
    await tracked.healthCheck();

    const entries = await tracker.readAll();
    expect(entries).toHaveLength(0);
  });
});
