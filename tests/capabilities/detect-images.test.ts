import { describe, expect, it } from "vitest";
import { detectImagesInText, messageHasImages } from "../../src/capabilities/detect-images.js";

describe("detectImagesInText", () => {
  it("detects posix image paths", () => {
    const images = detectImagesInText("Please inspect ./screenshots/error.png and fix it.");
    expect(images).toHaveLength(1);
    expect(images[0]?.path).toBe("./screenshots/error.png");
    expect(images[0]?.source).toBe("path");
  });

  it("detects windows image paths", () => {
    const images = detectImagesInText("Look at D:\\repo\\assets\\mockup.png");
    expect(images).toHaveLength(1);
    expect(images[0]?.path).toBe("D:\\repo\\assets\\mockup.png");
  });

  it("detects @mentions and markdown image syntax", () => {
    const images = detectImagesInText("Check @design/home.png and ![hero](./public/hero.webp)");
    expect(images.map((image) => image.path)).toEqual(["design/home.png", "./public/hero.webp"]);
  });

  it("deduplicates repeated references", () => {
    const images = detectImagesInText("./same.png ./same.png");
    expect(images).toHaveLength(1);
  });
});

describe("messageHasImages", () => {
  it("returns false for plain text", () => {
    expect(messageHasImages("fix the login bug")).toBe(false);
  });

  it("returns true when an image path is present", () => {
    expect(messageHasImages("see screenshot.png")).toBe(true);
  });
});
