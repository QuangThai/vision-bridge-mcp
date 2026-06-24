import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".bmp",
  ".svg",
  ".heic",
  ".heif",
  ".tiff",
]);

export function isImageFilePath(filePath: string): boolean {
  const lower = filePath.trim().toLowerCase();
  const dotIndex = lower.lastIndexOf(".");
  if (dotIndex === -1) {
    return false;
  }
  return IMAGE_EXTENSIONS.has(lower.slice(dotIndex));
}

export function looksLikeCursorAttachedImage(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/").toLowerCase();
  return (
    normalized.includes("/.cursor/projects/") ||
    normalized.includes("/assets/image-") ||
    normalized.endsWith("/assets/")
  );
}

function sessionStorePath(sessionId: string): string {
  const safeId = sessionId.replace(/[^a-zA-Z0-9_-]+/gu, "_");
  return join(tmpdir(), "atlas-vision-mcp", "session-images", `${safeId}.json`);
}

async function readSessionPaths(sessionId: string): Promise<string[]> {
  try {
    const raw = await readFile(sessionStorePath(sessionId), "utf8");
    const parsed = JSON.parse(raw) as { paths?: string[] };
    if (!Array.isArray(parsed.paths)) {
      return [];
    }
    return parsed.paths.filter((path) => typeof path === "string" && path.trim().length > 0);
  } catch {
    return [];
  }
}

export async function appendSessionImage(sessionId: string, imagePath: string): Promise<void> {
  const trimmed = imagePath.trim();
  if (!sessionId.trim() || !trimmed || !isImageFilePath(trimmed)) {
    return;
  }

  const storePath = sessionStorePath(sessionId);
  await mkdir(join(tmpdir(), "atlas-vision-mcp", "session-images"), { recursive: true });

  const existing = await readSessionPaths(sessionId);
  const seen = new Set(existing.map((path) => path.toLowerCase()));
  if (seen.has(trimmed.toLowerCase())) {
    return;
  }

  await writeFile(storePath, JSON.stringify({ paths: [...existing, trimmed] }), "utf8");
}

export async function consumeSessionImages(sessionId: string): Promise<string[]> {
  if (!sessionId.trim()) {
    return [];
  }

  const paths = await readSessionPaths(sessionId);
  try {
    await rm(sessionStorePath(sessionId), { force: true });
  } catch {
    // ignore cleanup failures
  }
  return paths;
}
