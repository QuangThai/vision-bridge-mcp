import sharp, { type Metadata } from "sharp";
import { ImageError } from "./errors.js";
import { assertWithinLimit } from "./limits.js";
import type { SupportedMimeType } from "./mime.js";

const MAX_RESIZE_ATTEMPTS = 6;
const INITIAL_MAX_DIMENSION = 2048;

// Target dimensions per detail level:
// - low:    512px  (OpenAI low-detail mode = 85 tokens)
// - medium: 1024px (coding screenshots with readable text, ~850 tokens for 1920×1080)
// - high:   2048px (full detail, ~2210 tokens for 1920×1080)
// - original: no resize (keep full resolution)
const DETAIL_TARGET_SHORT_SIDE: Record<string, number> = {
  low: 512,
  medium: 1024,
  high: 2048,
  original: 99999,
};

// Unique color ratio thresholds for auto-detection.
// Coding screenshots (code, terminal, IDE) typically have many syntax-highlighted
// colors but still need at least medium detail to render small text readable.
const RATIO_LOW = 0.15; // < 15% → simple UI (safe for 512px)
const RATIO_MEDIUM = 0.4; // 15-40% → coding screenshot (1024px for text readability)
// > 40% → photo/complex diagram (2048px)

// Sampling parameters for automatic detail level detection.
// Screenshots / UI images typically have lower color variation than photos.
const SCREENSHOT_SAMPLE_PIXELS = 2_000; // pixels to sample for color analysis
const SCREENSHOT_VARIATION_THRESHOLD = 0.06; // mean stdev/255 below this → likely UI

export interface PreprocessResult {
  buffer: Buffer;
  mimeType: SupportedMimeType;
  resized: boolean;
  /** Detail level used during preprocessing. */
  detailLevel?: string;
}

/**
 * Detect image content type using sharp metadata and pixel sampling.
 *
 * Screenshots / UI captures typically have:
 * - Fewer unique colors (flat UI panels, backgrounds)
 * - Lower color saturation (less vibrant than photos)
 * - More uniform regions
 *
 * Photos / complex diagrams have:
 * - Many unique colors (gradients, textures)
 * - Higher color saturation
 * - More natural variation
 */
export async function autoDetectDetailLevel(
  buffer: Buffer,
  filePath?: string,
): Promise<"low" | "medium" | "high"> {
  // 1. File-name heuristics
  if (filePath) {
    if (isSimpleUiName(filePath)) {
      return "low"; // Login forms, nav bars, simple UI
    }
    if (isScreenshotName(filePath)) {
      return "medium"; // Coding screenshots — need text readability
    }
  }

  const metadata = await sharp(buffer)
    .metadata()
    .catch(() => null);
  if (!metadata) return "high"; // safe default

  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  // Tiny images (< 800px) → low (negligible detail)
  if (width > 0 && height > 0 && width < 800 && height < 800) {
    return "low";
  }

  // 2. Color-sampling heuristic
  const uniqueRatio = await estimateUniqueColorRatio(buffer, metadata, width, height);
  if (uniqueRatio !== null) {
    if (uniqueRatio < RATIO_LOW) {
      return "low"; // Very few colors → simple UI
    }
    if (uniqueRatio < RATIO_MEDIUM) {
      return "medium"; // Moderate → coding screenshot
    }
    return "high"; // Many colors → photo/complex diagram
  }

  // 3. Variation analysis via sharp stats
  const stats = await sharp(buffer)
    .stats()
    .catch(() => null);
  if (stats) {
    const c0 = stats.channels[0]?.stdev ?? 0;
    const c1 = stats.channels[1]?.stdev ?? 0;
    const c2 = stats.channels[2]?.stdev ?? 0;
    const avgVariation = (c0 + c1 + c2) / 3 / 255;

    if (avgVariation < SCREENSHOT_VARIATION_THRESHOLD) {
      return "low"; // Very low variation → likely simple UI
    }
  }

  return "high";
}

/** Estimate the ratio of unique colors by sampling random pixels. */
async function estimateUniqueColorRatio(
  buffer: Buffer,
  _metadata: Metadata,
  width: number,
  height: number,
): Promise<number | null> {
  if (!width || !height) return null;

  const totalPixels = width * height;
  const sampleSize = Math.min(SCREENSHOT_SAMPLE_PIXELS, totalPixels);
  const step = Math.max(1, Math.floor(totalPixels / sampleSize));

  // Raw output with ensureAlpha guarantees 4 bytes per pixel (RGBA)
  const rawBuffer = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer()
    .catch(() => null);
  if (!rawBuffer) return null;

  const BYTES_PER_PIXEL = 4;
  const maxSamples = Math.min(sampleSize, Math.floor(rawBuffer.length / BYTES_PER_PIXEL));
  const colors = new Set<number>();

  for (let i = 0; i < maxSamples; i++) {
    const pixelIndex = (i * step) % totalPixels;
    const offset = pixelIndex * BYTES_PER_PIXEL;
    // Pack RGB into a single 24-bit integer (ignore alpha)
    const packed =
      ((rawBuffer[offset] ?? 0) << 16) |
      ((rawBuffer[offset + 1] ?? 0) << 8) |
      (rawBuffer[offset + 2] ?? 0);
    colors.add(packed);
  }

  return colors.size / maxSamples;
}

/**
 * File paths suggesting a simple UI component (large elements, minimal text).
 * These are safe for 512px low detail — the content remains readable.
 */
function isSimpleUiName(filePath: string): boolean {
  const name = filePath.toLowerCase();
  return (
    name.includes("login") ||
    name.includes("navbar") ||
    name.includes("nav-bar") ||
    name.includes("sidebar") ||
    name.includes("toolbar") ||
    name.includes("footer") ||
    name.includes("banner") ||
    name.includes("hero") ||
    name.includes("icon") ||
    name.includes("logo") ||
    name.includes("avatar") ||
    name.includes("button") ||
    name.includes("card")
  );
}

/**
 * File paths suggesting full coding screenshots (code, terminal, IDE).
 * These need at least 1024px medium detail for small text to be readable.
 */
function isScreenshotName(filePath: string): boolean {
  const name = filePath.toLowerCase();
  return (
    name.includes("screenshot") ||
    name.includes("screen") ||
    name.includes("capture") ||
    name.includes("snapshot") ||
    name.includes("desktop") ||
    name.includes("window") ||
    name.endsWith("screen") ||
    name.includes("printscreen") ||
    name.includes("scrot") ||
    name.includes("app") ||
    name.includes("ui") ||
    name.includes("code") ||
    name.includes("terminal") ||
    name.includes("console") ||
    name.includes("error")
  );
}

/**
 * Preprocess an image for vision API consumption.
 *
 * Key considerations:
 * - OpenAI/Gemini token cost is based on pixel DIMENSIONS, not file size.
 * - `detail: "low"` → model resizes to 512x512 internally, costs 85 tokens.
 *   We pre-resize to 512px shortest side to reduce upload payload.
 * - `detail: "high"` → model tiles at 512px squares, scales shortest side to 2048px.
 *   We pre-resize to 2048px shortest side to reduce payload without losing detail.
 * - For text-heavy images (screenshots, code, OCR), avoid aggressive JPEG compression
 *   that introduces artifacts. Use quality 92 for text-heavy, 85 for photos.
 * - File size limit enforcement (maxImageMb) runs after dimension optimization.
 */
export async function preprocessImage(
  buffer: Buffer,
  mimeType: SupportedMimeType,
  maxImageMb: number,
  filePath?: string,
  detailLevel?: string,
  adaptive?: boolean,
): Promise<PreprocessResult> {
  const maxBytes = maxImageMb * 1024 * 1024;

  // Auto-detect detail level when adaptive mode is on and no explicit level set.
  // Only set result.detailLevel when auto-detection runs (so tool layer can distinguish
  // auto-detected vs user-provided values and apply proper provider mapping).
  let detected: string | undefined;
  if (adaptive && !detailLevel) {
    detected = await autoDetectDetailLevel(buffer, filePath);
  }

  // Use auto-detected level (if any) for resize decisions; the original
  // detailLevel param is left untouched so the tool layer can apply proper mapping.
  const effectiveDetail = detected ?? detailLevel;

  if (buffer.length <= maxBytes && !effectiveDetail) {
    return { buffer, mimeType, resized: false, detailLevel: detected };
  }

  const metadata = await sharp(buffer)
    .metadata()
    .catch(() => {
      throw new ImageError(
        `Image is unreadable or corrupted.${filePath ? ` Path: ${filePath}` : ""}`,
        "unreadable",
        filePath,
      );
    });

  const width = metadata.width ?? INITIAL_MAX_DIMENSION;
  const height = metadata.height ?? INITIAL_MAX_DIMENSION;
  const shortSide = Math.min(width, height);

  // Determine target short side from detail level
  // Prefers auto-detected level (detected) for resize, falls back to user-supplied detailLevel
  const targetShortSide = effectiveDetail
    ? (DETAIL_TARGET_SHORT_SIDE[effectiveDetail] ?? INITIAL_MAX_DIMENSION)
    : INITIAL_MAX_DIMENSION;

  let current = buffer;
  let currentMime = mimeType;
  const isTextHeavy = detectTextHeavy(filePath);
  let resized = false;

  // Phase 1: Dimension-based downscale when image exceeds target for detail level
  if (shortSide > targetShortSide) {
    const scale = targetShortSide / shortSide;
    const targetWidth = Math.max(64, Math.floor(width * scale));
    const targetHeight = Math.max(64, Math.floor(height * scale));

    current = await sharp(buffer)
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toBuffer();
    resized = true;
  }

  // Phase 2: Format conversion if image is still too large
  // Strategy: use PNG for first attempts (better for small images, lossless),
  // then fall back to JPEG with decreasing quality.
  const jpegQuality = isTextHeavy ? 92 : 80;
  const pngQuality = isTextHeavy ? 90 : 80;

  for (let attempt = 0; attempt < MAX_RESIZE_ATTEMPTS && current.length > maxBytes; attempt += 1) {
    const scale = 0.75;
    const baseWidth = metadata.width ?? INITIAL_MAX_DIMENSION;
    const baseHeight = metadata.height ?? INITIAL_MAX_DIMENSION;
    const targetWidth = Math.max(32, Math.floor(baseWidth * scale ** (attempt + 1)));
    const targetHeight = Math.max(32, Math.floor(baseHeight * scale ** (attempt + 1)));
    // Keep PNG for first 2 attempts (lossless, lower overhead for small images),
    // or always for text-heavy images up to 3 attempts
    const usePng =
      (currentMime === "image/png" && attempt < 2) ||
      (isTextHeavy && currentMime === "image/png" && attempt < 3);

    if (usePng) {
      currentMime = "image/png";
      current = await sharp(buffer)
        .resize({
          width: targetWidth,
          height: targetHeight,
          fit: "inside",
          withoutEnlargement: true,
        })
        .toFormat("png", { quality: pngQuality })
        .toBuffer();
    } else {
      currentMime = "image/jpeg";
      current = await sharp(buffer)
        .resize({
          width: targetWidth,
          height: targetHeight,
          fit: "inside",
          withoutEnlargement: true,
        })
        .toFormat("jpeg", { quality: jpegQuality })
        .toBuffer();
    }
    resized = true;
  }

  try {
    assertWithinLimit(current.length, maxImageMb, filePath);
  } catch (error) {
    if (error instanceof ImageError && error.code === "too_large") {
      throw new ImageError(
        `${error.message} Try a smaller image or increase VISION_MAX_IMAGE_MB.`,
        "too_large",
        filePath,
      );
    }
    throw error;
  }

  return {
    buffer: current,
    mimeType: currentMime,
    resized,
    detailLevel: detected,
  };
}

function detectTextHeavy(filePath?: string): boolean {
  if (!filePath) return false;
  const name = filePath.toLowerCase();
  // Screenshots, code, terminal captures, and documents tend to be text-heavy
  // These patterns suggest the image contains significant text content
  return (
    name.includes("screenshot") ||
    name.includes("screen") ||
    name.includes("capture") ||
    name.includes("code") ||
    name.includes("terminal") ||
    name.includes("console") ||
    name.includes("error") ||
    name.includes("document") ||
    name.includes("text") ||
    name.includes("ocr")
  );
}

export async function readImageMetadata(buffer: Buffer, filePath?: string) {
  try {
    return await sharp(buffer).metadata();
  } catch {
    throw new ImageError(
      `Image is unreadable or corrupted.${filePath ? ` Path: ${filePath}` : ""}`,
      "unreadable",
      filePath,
    );
  }
}
