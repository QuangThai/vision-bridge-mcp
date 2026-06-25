import { describe, expect, it } from "vitest";
import { autoDetectDetailLevel, preprocessImage } from "../../src/image/preprocess.js";

/**
 * Create a simple PNG buffer at the given dimensions filled with a solid color.
 * Used to simulate screenshots (few colors, uniform areas).
 */
async function createSolidPng(
  width: number,
  height: number,
  r = 240,
  g = 240,
  b = 240,
): Promise<Buffer> {
  const sharp = await import("sharp");
  return sharp
    .default({
      create: {
        width,
        height,
        channels: 3,
        background: { r, g, b },
      },
    })
    .png()
    .toBuffer();
}

/**
 * Create a "photo-like" PNG with random pixel noise (many unique colors).
 */
async function createNoisePng(width: number, height: number): Promise<Buffer> {
  const sharp = await import("sharp");
  // Create random RGB pixel data
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = Math.floor(Math.random() * 256);
  }
  return sharp
    .default(pixels, {
      raw: { width, height, channels: 3 },
    })
    .png()
    .toBuffer();
}

/**
 * Create a UI-like image with a few colored rectangles (simulating a screenshot).
 */
async function createUiScreenshot(width: number, height: number): Promise<Buffer> {
  const sharp = await import("sharp");
  // Create a base white image
  const svg = `
    <svg width="${width}" height="${height}">
      <rect width="${width}" height="${height}" fill="#f5f5f5"/>
      <rect x="0" y="0" width="${width}" height="60" fill="#1a1a2e"/>
      <rect x="0" y="60" width="240" height="${height - 60}" fill="#e0e0e0"/>
      <rect x="250" y="80" width="${width - 270}" height="120" fill="#ffffff" rx="8"/>
      <rect x="250" y="220" width="${width - 270}" height="200" fill="#ffffff" rx="8"/>
      <rect x="250" y="440" width="${width - 270}" height="150" fill="#ffffff" rx="8"/>
    </svg>`;

  return sharp.default(Buffer.from(svg)).png().toBuffer();
}

describe("autoDetectDetailLevel", () => {
  it("returns 'low' for tiny images (< 800px)", async () => {
    const tiny = await createSolidPng(400, 300);
    const result = await autoDetectDetailLevel(tiny);
    expect(result).toBe("low");
  });

  it("returns 'medium' for screenshot-named files (need text readability)", async () => {
    const img = await createSolidPng(1920, 1080);
    const result = await autoDetectDetailLevel(img, "screenshot_error.png");
    expect(result).toBe("medium");
  });

  it("returns 'medium' for files with 'screen' in path", async () => {
    const img = await createSolidPng(1920, 1080);
    const result = await autoDetectDetailLevel(img, "/data/screen_capture.png");
    expect(result).toBe("medium");
  });

  it("returns 'medium' for files with 'capture' in path", async () => {
    const img = await createSolidPng(1920, 1080);
    const result = await autoDetectDetailLevel(img, "window_capture.png");
    expect(result).toBe("medium");
  });

  it("returns 'medium' for files with 'snapshot' in path", async () => {
    const img = await createSolidPng(1920, 1080);
    const result = await autoDetectDetailLevel(img, "snapshot_ui.png");
    expect(result).toBe("medium");
  });

  it("returns 'low' for simple UI component names", async () => {
    const img = await createSolidPng(1920, 1080);
    expect(await autoDetectDetailLevel(img, "login.png")).toBe("low");
    expect(await autoDetectDetailLevel(img, "navbar.png")).toBe("low");
    expect(await autoDetectDetailLevel(img, "hero_banner.png")).toBe("low");
    expect(await autoDetectDetailLevel(img, "icon_settings.png")).toBe("low");
  });

  it("returns 'low' for very uniform UI-like images (few unique colors)", async () => {
    const ui = await createUiScreenshot(1920, 1080);
    const result = await autoDetectDetailLevel(ui);
    expect(result).toBe("low");
  });

  it("returns 'medium' for coding images (code in name)", async () => {
    const img = await createSolidPng(1920, 1080);
    const result = await autoDetectDetailLevel(img, "code_snippet.png");
    expect(result).toBe("medium");
  });

  it("returns 'medium' for terminal captures", async () => {
    const img = await createSolidPng(1920, 1080);
    const result = await autoDetectDetailLevel(img, "terminal_output.png");
    expect(result).toBe("medium");
  });

  it("returns 'high' for high-variation images (noise)", async () => {
    const noise = await createNoisePng(1920, 1080);
    const result = await autoDetectDetailLevel(noise);
    expect(result).toBe("high");
  });

  it("returns 'high' for gradient-like images (many unique colors)", async () => {
    // Create a horizontal gradient image — has many unique colors from blending
    const sharp = await import("sharp");
    const width = 1200;
    const height = 800;
    const pixels = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        pixels[idx] = Math.floor((x / width) * 255); // R gradient
        pixels[idx + 1] = Math.floor((y / height) * 255); // G gradient
        pixels[idx + 2] = 128; // B constant
      }
    }
    const buf = await sharp
      .default(pixels, {
        raw: { width, height, channels: 3 },
      })
      .png()
      .toBuffer();
    const result = await autoDetectDetailLevel(buf, "gradient.png");
    // Smooth gradient has many unique colors → high
    expect(result).toBe("high");
  });

  it("returns 'low' for unnamed images with very few unique colors", async () => {
    // Pure solid color image (1 unique color)
    const sharp = await import("sharp");
    const buf = await sharp
      .default({
        create: { width: 1920, height: 1080, channels: 3, background: { r: 200, g: 200, b: 200 } },
      })
      .png()
      .toBuffer();
    const result = await autoDetectDetailLevel(buf);
    expect(result).toBe("low");
  });
});

describe("preprocessImage with adaptive mode", () => {
  it("preprocessImage auto-detects detail level when adaptive is true and no detailLevel", async () => {
    const ui = await createUiScreenshot(1920, 1080);
    const result = await preprocessImage(
      ui,
      "image/png",
      20,
      undefined, // no filePath
      undefined, // no detailLevel
      true, // adaptive
    );
    // UI screenshot with few colors → low
    expect(result.detailLevel).toBe("low");
    expect(result.resized).toBe(true);
  });

  it("preprocessImage uses medium for screenshot-named images with adaptive", async () => {
    const img = await createSolidPng(1920, 1080);
    const result = await preprocessImage(
      img,
      "image/png",
      20,
      "screenshot_dashboard.png",
      undefined,
      true,
    );
    expect(result.detailLevel).toBe("medium");
    expect(result.resized).toBe(true);
  });

  it("preprocessImage respects explicit detailLevel over adaptive mode", async () => {
    const ui = await createUiScreenshot(1920, 1080);
    const result = await preprocessImage(ui, "image/png", 20, undefined, "high", true);
    // When explicit detail is provided, adaptive does NOT override,
    // so detailLevel is undefined (tool layer uses mapDetailLevel instead).
    expect(result.detailLevel).toBeUndefined();
    // With high detail (2048px target) and 1080px short side, no resize needed
    // Image size is well under 20MB limit, so no compression resize either
  });

  it("preprocessImage does not run adaptive when adaptive is falsy", async () => {
    const ui = await createUiScreenshot(1920, 1080);
    const result = await preprocessImage(ui, "image/png", 20, undefined, undefined, false);
    // No detail level was explicitly set and adaptive is off
    expect(result.detailLevel).toBeUndefined();
  });
});
