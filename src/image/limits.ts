import { ImageError } from "./errors.js";

const BYTES_PER_MB = 1024 * 1024;

export function maxImageBytes(maxImageMb: number): number {
  return Math.floor(maxImageMb * BYTES_PER_MB);
}

export function assertWithinLimit(sizeBytes: number, maxImageMb: number, filePath?: string): void {
  const limit = maxImageBytes(maxImageMb);
  if (sizeBytes > limit) {
    throw new ImageError(
      `Image is too large (${formatBytes(sizeBytes)}). Maximum allowed size is ${maxImageMb} MB (${formatBytes(limit)}).`,
      "too_large",
      filePath,
    );
  }
}

export function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  if (sizeBytes < BYTES_PER_MB) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }

  return `${(sizeBytes / BYTES_PER_MB).toFixed(2)} MB`;
}
