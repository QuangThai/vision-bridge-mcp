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
}

export interface ReadImageOptions {
  maxImageMb: number;
  cwd?: string;
  allowedDirs?: string[];
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

export async function readImageFromPath(
  imagePath: string,
  options: ReadImageOptions,
): Promise<LoadedImage> {
  const cwd = options.cwd ?? process.cwd();
  const allowedDirs = options.allowedDirs ?? ["."];

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
  const processed = await preprocessImage(buffer, detectedMime, options.maxImageMb, absolutePath);
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
  };
}

export function toEncodedImage(image: LoadedImage): { mimeType: string; base64: string } {
  return {
    mimeType: image.mimeType,
    base64: image.base64,
  };
}
