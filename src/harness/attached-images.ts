import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectImagesInText } from "../capabilities/detect-images.js";

export interface AttachedImageLike {
  type: "image";
  data: string;
  mimeType: string;
}

export interface TemporaryAttachedImages {
  paths: string[];
  cleanup: () => Promise<void>;
}

function extensionForMimeType(mimeType: string): string {
  switch (mimeType.toLowerCase()) {
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/bmp":
      return ".bmp";
    case "image/svg+xml":
      return ".svg";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    case "image/tiff":
      return ".tiff";
    default:
      return ".png";
  }
}

export async function persistAttachedImages(
  images: AttachedImageLike[] | undefined,
  sessionId = "session",
): Promise<string[]> {
  if (!images || images.length === 0) {
    return [];
  }

  const dir = join(tmpdir(), "atlas-vision-mcp", sessionId);
  await mkdir(dir, { recursive: true });

  const paths: string[] = [];
  for (const [index, image] of images.entries()) {
    if (image.type !== "image" || !image.data.trim()) {
      continue;
    }

    const extension = extensionForMimeType(image.mimeType);
    const filePath = join(dir, `attached-${index + 1}${extension}`);
    await writeFile(filePath, Buffer.from(image.data, "base64"));
    paths.push(filePath);
  }

  return paths;
}

export async function persistTemporaryAttachedImages(
  images: AttachedImageLike[],
  scopeId?: string,
): Promise<TemporaryAttachedImages> {
  if (images.length === 0) {
    return { paths: [], cleanup: async () => undefined };
  }

  const root = join(tmpdir(), "atlas-vision-mcp");
  await mkdir(root, { recursive: true });
  const safeScope = scopeId?.replace(/[^a-zA-Z0-9_-]+/gu, "_").slice(0, 48);
  const prefix = safeScope ? `tool-result-${safeScope}-` : "intercept-";
  const dir = await mkdtemp(join(root, prefix));

  try {
    const paths: string[] = [];
    for (const [index, image] of images.entries()) {
      if (!image.data.trim()) {
        continue;
      }

      const extension = extensionForMimeType(image.mimeType);
      const filePath = join(dir, `attached-${index + 1}${extension}`);
      await writeFile(filePath, Buffer.from(image.data, "base64"));
      paths.push(filePath);
    }

    let cleaned = false;
    return {
      paths,
      cleanup: async () => {
        if (cleaned) {
          return;
        }
        await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
        cleaned = true;
      },
    };
  } catch (error) {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    throw error;
  }
}

export function buildInterceptMessageText(prompt: string, attachedImagePaths: string[]): string {
  const lines = [prompt.trim()];
  for (const imagePath of attachedImagePaths) {
    lines.push(`Attached image: ${imagePath}`);
  }
  return lines.filter((line) => line.length > 0).join("\n");
}

export function collectImagePathsFromPrompt(
  prompt: string,
  attachedImagePaths: string[],
): string[] {
  const detected = detectImagesInText(prompt).map((image) => image.path);
  const combined = [...detected, ...attachedImagePaths];
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const path of combined) {
    const key = path.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(path);
  }

  return unique;
}
