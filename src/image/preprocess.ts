import sharp from "sharp";
import { ImageError } from "./errors.js";
import { assertWithinLimit } from "./limits.js";
import { type SupportedMimeType } from "./mime.js";

const MAX_RESIZE_ATTEMPTS = 6;
const INITIAL_MAX_DIMENSION = 2048;

export interface PreprocessResult {
  buffer: Buffer;
  mimeType: SupportedMimeType;
  resized: boolean;
}

export async function preprocessImage(
  buffer: Buffer,
  mimeType: SupportedMimeType,
  maxImageMb: number,
  filePath?: string,
): Promise<PreprocessResult> {
  const maxBytes = maxImageMb * 1024 * 1024;
  if (buffer.length <= maxBytes) {
    return { buffer, mimeType, resized: false };
  }

  const metadata = await sharp(buffer).metadata().catch(() => {
    throw new ImageError(
      `Image is unreadable or corrupted.${filePath ? ` Path: ${filePath}` : ""}`,
      "unreadable",
      filePath,
    );
  });

  let current = buffer;
  let currentMime = mimeType;
  let scale = 1;
  let resized = false;

  for (let attempt = 0; attempt < MAX_RESIZE_ATTEMPTS && current.length > maxBytes; attempt += 1) {
    scale *= 0.75;
    const baseWidth = metadata.width ?? INITIAL_MAX_DIMENSION;
    const baseHeight = metadata.height ?? INITIAL_MAX_DIMENSION;
    const targetWidth = Math.max(64, Math.floor(baseWidth * scale));
    const targetHeight = Math.max(64, Math.floor(baseHeight * scale));
    const outputFormat = currentMime === "image/png" && attempt < 2 ? "png" : "jpeg";
    currentMime = outputFormat === "png" ? "image/png" : "image/jpeg";

    current = await sharp(buffer)
      .resize({
        width: targetWidth,
        height: targetHeight,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toFormat(outputFormat, { quality: 80 })
      .toBuffer();

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
