import sharp from "sharp";

/**
 * Pixel-difference detection options.
 */
export interface DiffOptions {
  /** Threshold (0–1) above which a pixel is considered "different". 0.05 = 5% channel difference. */
  threshold?: number;
  /** Highlight color for changed pixels (default: red) */
  highlightColor?: { r: number; g: number; b: number };
}

const DEFAULT_THRESHOLD = 0.05;
const RED = { r: 255, g: 0, b: 0 };

/**
 * Generate a visual diff image between two PNG buffers.
 *
 * Compares pixel-by-pixel and highlights changed regions in red (semi-transparent).
 * Non-changed areas are dimmed to 50% opacity so differences stand out.
 *
 * Returns the diff image as a PNG buffer.
 */
export async function generateDiffImage(
  beforeBuffer: Buffer,
  afterBuffer: Buffer,
  options: DiffOptions = {},
): Promise<Buffer> {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  const color = options.highlightColor ?? RED;

  // Get metadata for both images to know dimensions
  const [beforeMeta, afterMeta] = await Promise.all([
    sharp(beforeBuffer).metadata(),
    sharp(afterBuffer).metadata(),
  ]);

  const width = Math.max(beforeMeta.width ?? 0, afterMeta.width ?? 0);
  const height = Math.max(beforeMeta.height ?? 0, afterMeta.height ?? 0);

  if (width === 0 || height === 0) {
    throw new Error("Cannot generate diff: one or both images have zero dimensions");
  }

  // Resize both to the same dimensions (max of both) for comparison
  const [beforeRgba, afterRgba] = await Promise.all([
    sharp(beforeBuffer).resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer(),
    sharp(afterBuffer).resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer(),
  ]);

  // Pixel comparison — build a diff overlay
  const overlay = Buffer.alloc(width * height * 4, 0); // RGBA, transparent initially

  let diffCount = 0;
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    const br = beforeRgba[offset] ?? 0;
    const bg = beforeRgba[offset + 1] ?? 0;
    const bb = beforeRgba[offset + 2] ?? 0;
    const ar = afterRgba[offset] ?? 0;
    const ag = afterRgba[offset + 1] ?? 0;
    const ab = afterRgba[offset + 2] ?? 0;

    const dr = Math.abs(br - ar) / 255;
    const dg = Math.abs(bg - ag) / 255;
    const db = Math.abs(bb - ab) / 255;

    if (dr > threshold || dg > threshold || db > threshold) {
      // Changed pixel — highlight with specified color, semi-transparent
      overlay[offset] = color.r;
      overlay[offset + 1] = color.g;
      overlay[offset + 2] = color.b;
      overlay[offset + 3] = 180; // ~70% opacity
      diffCount++;
    } else {
      // Unchanged — dim the pixel
      overlay[offset] = 0;
      overlay[offset + 1] = 0;
      overlay[offset + 2] = 0;
      overlay[offset + 3] = 80; // ~31% opacity (dimming effect)
    }
  }

  // Compose: use the "after" image as base, overlay the diff on top
  const afterResized = await sharp(afterBuffer)
    .resize(width, height, { fit: "fill" })
    .png()
    .toBuffer();

  const diffOverlay = await sharp(overlay, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();

  const result = await sharp(afterResized)
    .composite([{ input: diffOverlay, blend: "over" }])
    .png()
    .toBuffer();

  return result;
}
