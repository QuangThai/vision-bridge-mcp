import { describe, expect, it } from "vitest";
import {
  imageRegionSchema,
  sourceRegionSchema,
} from "../../src/extraction/schemas.js";

describe("sourceRegionSchema", () => {
  it("accepts valid pixel coordinates", () => {
    const result = sourceRegionSchema.safeParse({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    expect(result.success).toBe(true);
  });

  it("accepts floats for relative coordinates", () => {
    const result = sourceRegionSchema.safeParse({
      x: 0.5,
      y: 0.5,
      width: 0.3,
      height: 0.2,
      unit: "relative",
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative x", () => {
    const result = sourceRegionSchema.safeParse({
      x: -1,
      y: 0,
      width: 100,
      height: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative y", () => {
    const result = sourceRegionSchema.safeParse({
      x: 0,
      y: -5,
      width: 100,
      height: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero or negative width", () => {
    const result = sourceRegionSchema.safeParse({
      x: 0,
      y: 0,
      width: 0,
      height: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero or negative height", () => {
    const result = sourceRegionSchema.safeParse({
      x: 0,
      y: 0,
      width: 100,
      height: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("imageRegionSchema", () => {
  it("accepts valid integer pixel coordinates", () => {
    const result = imageRegionSchema.safeParse({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative x", () => {
    const result = imageRegionSchema.safeParse({
      x: -1,
      y: 0,
      width: 100,
      height: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects float x (must be integer)", () => {
    const result = imageRegionSchema.safeParse({
      x: 0.5,
      y: 0,
      width: 100,
      height: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero width (min 1)", () => {
    const result = imageRegionSchema.safeParse({
      x: 0,
      y: 0,
      width: 0,
      height: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects zero height (min 1)", () => {
    const result = imageRegionSchema.safeParse({
      x: 0,
      y: 0,
      width: 100,
      height: 0,
    });
    expect(result.success).toBe(false);
  });
});
