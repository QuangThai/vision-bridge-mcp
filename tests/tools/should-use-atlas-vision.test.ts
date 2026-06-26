import { describe, expect, it } from "vitest";
import { shouldUseAtlasVision } from "../../src/tools/should-use-atlas-vision.js";

const CLEAN_ENV: NodeJS.ProcessEnv = {
  ATLAS_FORCE_INTERCEPT: "false",
  ATLAS_SKIP_INTERCEPT: "false",
};

describe("shouldUseAtlasVision", () => {
  it("returns false for cursor/composer-2.5", async () => {
    const result = await shouldUseAtlasVision(
      { main_model_ref: "cursor/composer-2.5" },
      { env: CLEAN_ENV },
    );

    expect(result.structured.should_use_atlas_vision).toBe(false);
    expect(result.structured.supports_native_vision).toBe(true);
  });

  it("returns true for deepseek text-only model", async () => {
    const result = await shouldUseAtlasVision(
      { main_model_ref: "deepseek/deepseek-v4-flash" },
      { env: CLEAN_ENV },
    );

    expect(result.structured.should_use_atlas_vision).toBe(true);
    expect(result.structured.supports_native_vision).toBe(false);
  });

  it("respects supports_vision runtime signal", async () => {
    const result = await shouldUseAtlasVision(
      {
        main_model_ref: "deepseek/deepseek-v4-flash",
        supports_vision: true,
      },
      { env: CLEAN_ENV },
    );

    expect(result.structured.should_use_atlas_vision).toBe(false);
  });

  it("composer skips even when MAIN_MODEL_REF is text-only", async () => {
    const result = await shouldUseAtlasVision(
      { main_model_ref: "cursor/composer-2.5" },
      {
        env: {
          ...CLEAN_ENV,
          MAIN_MODEL_REF: "deepseek/deepseek-v4-flash",
        },
      },
    );

    expect(result.structured.should_use_atlas_vision).toBe(false);
    expect(result.structured.supports_native_vision).toBe(true);
  });
});
