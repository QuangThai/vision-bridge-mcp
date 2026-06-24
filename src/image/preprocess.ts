import sharp from "sharp";
import { ImageError } from "./errors.js";
import { assertWithinLimit } from "./limits.js";
import type { SupportedMimeType } from "./mime.js";

const MAX_RESIZE_ATTEMPTS = 6;
const INITIAL_MAX_DIMENSION = 2048;

// Target dimensions per detail level:
// - low: 512px (OpenAI low-detail mode uses 512x512, 85 tokens)
// - high: 2048px shortest side (standard high fidelity)
// - original: no resize (keep full resolution)
const DETAIL_TARGET_SHORT_SIDE: Record<string, number> = {
  low: 512,
  high: 2048,
  original: 99999,
};

export interface PreprocessResult {
  buffer: Buffer;
  mimeType: SupportedMimeType;
  resized: boolean;
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
): Promise<PreprocessResult> {
  const maxBytes = maxImageMb * 1024 * 1024;

  if (buffer.length <= maxBytes && !detailLevel) {
    return { buffer, mimeType, resized: false };
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
  const targetShortSide = detailLevel
    ? (DETAIL_TARGET_SHORT_SIDE[detailLevel] ?? INITIAL_MAX_DIMENSION)
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
