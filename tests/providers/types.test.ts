import { describe, expect, it } from "vitest";
import { mapDetailLevel, mapDetailToMediaResolution } from "../../src/providers/types.js";

describe("mapDetailLevel", () => {
  it("maps 'detailed' to 'xhigh' (Volcengine rejects 'original')", () => {
    expect(mapDetailLevel("detailed")).toBe("xhigh");
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
  it("maps 'xhigh' to Gemini's 'original' media_resolution", () => {
    expect(mapDetailToMediaResolution("xhigh")).toBe("original");
  });

  it("maps 'original' to 'original' as before", () => {
    expect(mapDetailToMediaResolution("original")).toBe("original");
  });

  it("leaves 'high' as the default (undefined)", () => {
    expect(mapDetailToMediaResolution("high")).toBeUndefined();
  });
});
