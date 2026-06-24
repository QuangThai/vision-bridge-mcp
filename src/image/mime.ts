import { extname } from "node:path";
import { ImageError } from "./errors.js";

export const SUPPORTED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

const EXTENSION_TO_MIME: Record<string, SupportedMimeType> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) {
    return false;
  }

  return bytes.every((byte, index) => buffer[index] === byte);
}

function detectMimeFromBuffer(buffer: Buffer): SupportedMimeType | null {
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

function detectMimeFromExtension(filePath?: string): SupportedMimeType | null {
  if (!filePath) {
    return null;
  }

  const extension = extname(filePath).toLowerCase();
  return EXTENSION_TO_MIME[extension] ?? null;
}

export function isSupportedMimeType(value: string): value is SupportedMimeType {
  return (SUPPORTED_MIME_TYPES as readonly string[]).includes(value);
}

export function detectMimeType(buffer: Buffer, filePath?: string): SupportedMimeType {
  const fromBuffer = detectMimeFromBuffer(buffer);
  const fromExtension = detectMimeFromExtension(filePath);

  if (fromBuffer) {
    if (fromExtension && fromExtension !== fromBuffer) {
      return fromBuffer;
    }
    return fromBuffer;
  }

  if (fromExtension) {
    return fromExtension;
  }

  throw new ImageError(
    `Unsupported image format. Supported formats: png, jpg, jpeg, webp.${filePath ? ` Path: ${filePath}` : ""}`,
    "unsupported_format",
    filePath,
  );
}

export function formatFromMimeType(mimeType: SupportedMimeType): "png" | "jpeg" | "webp" {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpeg";
    case "image/webp":
      return "webp";
    default: {
      const unknown: never = mimeType;
      throw new ImageError(`Unsupported MIME type: ${unknown as string}`, "unsupported_format");
    }
  }
}
