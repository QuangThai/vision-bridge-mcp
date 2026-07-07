import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { isIP } from "node:net";
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
 * Check if a hostname is an IPv6 address in the private/link-local range.
 */
function isPrivateIpv6(hostname: string): boolean {
  const ipv6 = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
  if (!isIP(ipv6)) return false;

  // Normalize to lowercase for prefix matching
  const lower = ipv6.toLowerCase();

  // ::1 — loopback (IPv6)
  if (lower === "::1") return true;

  // fd00::/8 — Unique Local Addresses (ULA)
  if (lower.startsWith("fd") || lower.startsWith("fc")) return true;

  // fe80::/10 — Link-Local addresses
  if (
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  )
    return true;

  // fec0::/10 — Site-Local addresses (deprecated but still valid)
  if (
    lower.startsWith("fec") ||
    lower.startsWith("fed") ||
    lower.startsWith("fee") ||
    lower.startsWith("fef")
  )
    return true;

  // ::ffff:x.x.x.x — IPv4-mapped IPv6 addresses
  if (lower.startsWith("::ffff:")) {
    const v4part = lower.slice(7); // "::ffff:" is 7 chars
    return isPrivateIpv4(v4part);
  }

  // ::x.x.x.x — IPv4-compatible IPv6 addresses
  if (lower.startsWith("::") && lower.length > 2 && lower.includes(".")) {
    const v4part = lower.replace(/^::/, "");
    return isPrivateIpv4(v4part);
  }

  return false;
}

/**
 * Check if a hostname is a private/reserved IPv4 address.
 */
function isPrivateIpv4(hostname: string): boolean {
  // 127.0.0.0/8 — loopback
  if (hostname.startsWith("127.")) return true;

  // 10.0.0.0/8 — private
  if (hostname.startsWith("10.")) return true;

  // 192.168.0.0/16 — private
  if (hostname.startsWith("192.168.")) return true;

  // 172.16.0.0/12 — private
  if (hostname.startsWith("172.") && hostname.split(".").length > 1) {
    const secondOctet = Number(hostname.split(".")[1]);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }

  // 169.254.0.0/16 — link-local (includes cloud metadata 169.254.169.254)
  if (hostname.startsWith("169.254.")) return true;

  // 0.0.0.0/8 — current network
  if (hostname.startsWith("0.")) return true;

  // 198.18.0.0/15 — benchmark testing
  if (hostname.startsWith("198.18.") || hostname.startsWith("198.19.")) return true;

  return false;
}

/**
 * SSRF protection: reject URLs pointing to private/local networks.
 */
function assertAllowedImageUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ImageError(`Invalid image URL: ${url}`, "unreadable", url);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and loopback hostnames
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "0.0.0.0"
  ) {
    throw new ImageError(
      `Image URL points to localhost which is not allowed: ${url}`,
      "path_not_allowed",
      url,
    );
  }

  // Block .local domains (mDNS)
  if (
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".intranet")
  ) {
    throw new ImageError(
      `Image URL points to a .local/.internal address which is not allowed: ${url}`,
      "path_not_allowed",
      url,
    );
  }

  // Block private IPv4 ranges
  if (isPrivateIpv4(hostname)) {
    throw new ImageError(
      `Image URL points to a private network address which is not allowed: ${url}`,
      "path_not_allowed",
      url,
    );
  }

  // Block private IPv6 ranges
  if (isPrivateIpv6(hostname)) {
    throw new ImageError(
      `Image URL points to a private network address which is not allowed: ${url}`,
      "path_not_allowed",
      url,
    );
  }

  // Block bare IPs that aren't public
  if (isIP(hostname)) {
    // If it's an IP and not explicitly reserved, it might be a public IP — allow
    // Reserved ranges already caught above
  }
}

/**
 * Maximum bytes to download from a URL before rejecting (to prevent OOM).
 * Default maxImageMb is 10MB, but this sets a hard ceiling at 20MB.
 */
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

/**
 * Allowed image MIME types for URL downloads (checked via Content-Type header).
 */
const ALLOWED_DOWNLOAD_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/svg+xml",
  "image/tiff",
  "image/heic",
  "image/heif",
  "image/avif",
];

/**
 * Check whether the Content-Type from an HTTP response indicates an image.
 */
function isImageContentType(contentType: string | null): boolean {
  if (!contentType) return true; // allow when missing (MIME detection runs later)
  const lower = contentType.split(";")[0].trim().toLowerCase();
  return (
    ALLOWED_DOWNLOAD_MIME_TYPES.some((t) => lower === t || lower.startsWith(t)) ||
    lower.startsWith("image/")
  );
}

/**
 * Resolve the final URL after redirects to check it's still allowed.
 * This prevents SSRF bypass via HTTP redirect to internal addresses.
 */
async function resolveRedirectTarget(response: Response): Promise<string | null> {
  // If the response is a redirect, extract the Location header
  const location = response.headers.get("location");
  if (!location) return null;

  try {
    const resolved = new URL(location, response.url);
    return resolved.href;
  } catch {
    return null;
  }
}

/**
 * Download an image from a URL and return the buffer.
 * Uses streaming to enforce a size limit and validates the response.
 */
async function downloadImage(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30_000);

  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      redirect: "manual",
    });
  } catch (error) {
    clearTimeout(timeoutId);
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Image download timed out after 30 seconds."
        : "Failed to connect to image URL.";
    throw new ImageError(message, "unreadable", url);
  }
  clearTimeout(timeoutId);

  // Handle redirects manually — resolve and check the target
  if (response.status >= 300 && response.status < 400) {
    const redirectTarget = await resolveRedirectTarget(response);
    if (redirectTarget) {
      // Recursively download the redirect target (will be validated by readImageFromPath's outer call)
      // We re-validate the redirect target through the full SSRF check
      const redirectParsed = new URL(redirectTarget);
      const redirectHostname = redirectParsed.hostname.toLowerCase();

      // Check if redirect target is local/private
      if (
        redirectHostname === "localhost" ||
        redirectHostname === "127.0.0.1" ||
        redirectHostname === "[::1]" ||
        redirectHostname === "0.0.0.0" ||
        redirectHostname.endsWith(".local") ||
        redirectHostname.endsWith(".internal") ||
        isPrivateIpv4(redirectHostname) ||
        isPrivateIpv6(redirectHostname)
      ) {
        throw new ImageError(
          "Image URL redirects to a private or local address which is not allowed.",
          "path_not_allowed",
          url,
        );
      }

      return downloadImage(redirectTarget);
    }
    throw new ImageError("Image URL returned a redirect with no valid target.", "unreadable", url);
  }

  if (!response.ok) {
    // Sanitized error — do NOT include URL or status code to prevent SSRF probing
    throw new ImageError(
      "Failed to download image from URL: the server returned an error.",
      "unreadable",
      url,
    );
  }

  // Check Content-Type before downloading the body
  const contentType = response.headers.get("content-type");
  if (contentType && !isImageContentType(contentType)) {
    throw new ImageError(
      `Image URL does not point to an image (Content-Type: ${contentType.split(";")[0].trim()}).`,
      "unreadable",
      url,
    );
  }

  // Stream the response with a size limit to prevent OOM
  const reader = response.body?.getReader();
  if (!reader) {
    throw new ImageError("Failed to read image data from URL.", "unreadable", url);
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        totalBytes += value.length;
        if (totalBytes > MAX_DOWNLOAD_BYTES) {
          reader.cancel().catch(() => {});
          throw new ImageError(
            `Image download exceeded maximum size of ${MAX_DOWNLOAD_BYTES / (1024 * 1024)} MB.`,
            "unreadable",
            url,
          );
        }
        chunks.push(value);
      }
    }
  } catch (error) {
    // Re-throw known ImageErrors; wrap others
    if (error instanceof ImageError) throw error;
    throw new ImageError(
      "Failed to download image from URL: connection interrupted.",
      "unreadable",
      url,
    );
  }

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }

  return Buffer.from(combined.buffer, combined.byteOffset, combined.byteLength);
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
    absolutePath = (await assertPathAllowed(imagePath, { allowedDirs, cwd })).absolutePath;
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
