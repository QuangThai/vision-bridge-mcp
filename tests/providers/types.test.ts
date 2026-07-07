import { describe, expect, it } from "vitest";
import { mapDetailLevel, mapDetailToMediaResolution } from "../../src/providers/types.js";

describe("mapDetailLevel", () => {
  it("maps 'detailed' to 'original' (shared across all providers)", () => {
    expect(mapDetailLevel("detailed")).toBe("original");
  });

  it("maps 'brief' and 'standard' unchanged", () => {
    expect(mapDetailLevel("brief")).toBe("low");
    expect(mapDetailLevel("standard")).toBe("high");
  });

  it("returns undefined for unknown levels", () => {
    expect(mapDetailLevel("unknown")).toBeUndefined();
  });
});

describe("mapDetailToMediaResolution", () => {
  it("maps 'original' to Gemini 3's MEDIA_RESOLUTION_ORIGINAL", () => {
    expect(mapDetailToMediaResolution("original", "gemini-3-pro")).toBe(
      "MEDIA_RESOLUTION_ORIGINAL",
    );
  });

  it("leaves 'high' as the default (undefined)", () => {
    expect(mapDetailToMediaResolution("high", "gemini-3-pro")).toBeUndefined();
  });

  it("returns undefined for pre-Gemini-3 models regardless of detail level", () => {
    expect(mapDetailToMediaResolution("original", "gemini-2.5-pro")).toBeUndefined();
  });

  it("does not gate when no model is given (back-compat call site)", () => {
    expect(mapDetailToMediaResolution("original")).toBe("MEDIA_RESOLUTION_ORIGINAL");
  });
});
