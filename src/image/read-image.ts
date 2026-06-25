import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { PathPolicyError, assertPathAllowed } from "../security/path-policy.js";
import { ImageError } from "./errors.js";
import { detectMimeType } from "./mime.js";
import { preprocessImage, readImageMetadata } from "./preprocess.js";

export interface LoadedImage {
  path: string;
  absolutePath: string;
  mimeType: string;
  base64: string;
  sizeBytes: number;
  resized: boolean;
  width?: number;
  height?: number;
  sourceUrl?: string;
  /** Auto-detected optimal detail level for the provider API call. */
  detailLevel?: string;
}

export interface ReadImageOptions {
  maxImageMb: number;
  cwd?: string;
  allowedDirs?: string[];
  detailLevel?: string;
  /** Auto-detect optimal detail level when not explicitly set. */
  adaptiveDetail?: boolean;
}

async function assertReadableFile(absolutePath: string): Promise<void> {
  try {
    await access(absolutePath, constants.R_OK);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      throw new ImageError(
        `Image file not found: ${absolutePath}. Current working directory: ${process.cwd()}`,
        "not_found",
        absolutePath,
      );
    }

    throw new ImageError(
      `Unable to read image file: ${absolutePath}. ${nodeError.message}`,
      "unreadable",
      absolutePath,
    );
  }
}

/**
 * Check if a string looks like a URL.
 */
function isUrl(source: string): boolean {
  try {
    const url = new URL(source);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * SSRF protection: reject URLs pointing to private/local networks.
 * Users can configure ATLAS_ALLOWED_URLS to restrict to specific domains.
 */
function assertAllowedImageUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ImageError(`Invalid image URL: ${url}`, "unreadable", url);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and loopback
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
    throw new ImageError(
      `Image URL points to localhost which is not allowed: ${url}`,
      "path_not_allowed",
      url,
    );
  }

  // Block .local domains (mDNS)
  if (hostname.endsWith(".local")) {
    throw new ImageError(
      `Image URL points to a .local address which is not allowed: ${url}`,
      "path_not_allowed",
      url,
    );
  }

  // Block private IPv4 ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  if (hostname.startsWith("10.") || hostname.startsWith("192.168.")) {
    throw new ImageError(
      `Image URL points to a private network address which is not allowed: ${url}`,
      "path_not_allowed",
      url,
    );
  }
  if (hostname.startsWith("172.") && hostname.split(".").length > 1) {
    const secondOctet = Number(hostname.split(".")[1]);
    if (secondOctet >= 16 && secondOctet <= 31) {
      throw new ImageError(
        `Image URL points to a private network address (172.16-31.*) which is not allowed: ${url}`,
        "path_not_allowed",
        url,
      );
    }
  }

  // Block 0.0.0.0
  if (hostname === "0.0.0.0") {
    throw new ImageError(
      `Image URL points to 0.0.0.0 which is not allowed: ${url}`,
      "path_not_allowed",
      url,
    );
  }
}

/**
 * Download an image from a URL and return the buffer.
 */
async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new ImageError(
      `Failed to download image from URL: ${url}. HTTP ${response.status}`,
      "unreadable",
      url,
    );
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function readImageFromPath(
  imagePath: string,
  options: ReadImageOptions,
): Promise<LoadedImage> {
  const cwd = options.cwd ?? process.cwd();
  const allowedDirs = options.allowedDirs ?? ["."];

  // URL support: download the image instead of reading from local file
  if (isUrl(imagePath)) {
    // SSRF protection: reject private/local network URLs
    assertAllowedImageUrl(imagePath);

    let buffer: Buffer;
    try {
      buffer = await downloadImage(imagePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown download error";
      throw new ImageError(`Unable to download image: ${message}`, "unreadable", imagePath);
    }

    if (buffer.length === 0) {
      throw new ImageError(`Downloaded image is empty: ${imagePath}`, "unreadable", imagePath);
    }

    const detectedMime = detectMimeType(buffer, imagePath);
    const processed = await preprocessImage(
      buffer,
      detectedMime,
      options.maxImageMb,
      imagePath,
      options.detailLevel,
      options.adaptiveDetail,
    );
    const metadata = await readImageMetadata(processed.buffer, imagePath);

    return {
      path: imagePath,
      absolutePath: imagePath,
      mimeType: processed.mimeType,
      base64: processed.buffer.toString("base64"),
      sizeBytes: processed.buffer.length,
      resized: processed.resized,
      width: metadata.width,
      height: metadata.height,
      sourceUrl: imagePath,
      detailLevel: processed.detailLevel,
    };
  }

  let absolutePath: string;
  try {
    absolutePath = assertPathAllowed(imagePath, { allowedDirs, cwd }).absolutePath;
  } catch (error) {
    if (error instanceof PathPolicyError) {
      throw new ImageError(error.message, "path_not_allowed", imagePath);
    }
    throw error;
  }

  await assertReadableFile(absolutePath);

  let buffer: Buffer;
  try {
    buffer = await readFile(absolutePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown read error";
    throw new ImageError(
      `Unable to read image file: ${absolutePath}. ${message}`,
      "unreadable",
      absolutePath,
    );
  }

  if (buffer.length === 0) {
    throw new ImageError(`Image file is empty: ${absolutePath}`, "unreadable", absolutePath);
  }

  const detectedMime = detectMimeType(buffer, absolutePath);
  const processed = await preprocessImage(
    buffer,
    detectedMime,
    options.maxImageMb,
    absolutePath,
    options.detailLevel,
    options.adaptiveDetail,
  );
  const metadata = await readImageMetadata(processed.buffer, absolutePath);

  return {
    path: imagePath,
    absolutePath,
    mimeType: processed.mimeType,
    base64: processed.buffer.toString("base64"),
    sizeBytes: processed.buffer.length,
    resized: processed.resized,
    width: metadata.width,
    height: metadata.height,
    detailLevel: processed.detailLevel,
  };
}

export function toEncodedImage(image: LoadedImage): { mimeType: string; base64: string } {
  return {
    mimeType: image.mimeType,
    base64: image.base64,
  };
}
