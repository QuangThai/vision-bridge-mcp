import type { DetectedImage } from "./types.js";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".svg",
  ".heic",
  ".heif",
  ".tiff",
  ".tif",
]);

const WINDOWS_PATH_PATTERN =
  /(?:[A-Za-z]:\\|\\\\)[^\s"'`<>|*?]+?\.(?:png|jpe?g|gif|webp|bmp|svg|heic|heif|tiff?)/gi;

const POSIX_PATH_PATTERN =
  /(?:\.\/|\/)?[^\s"'`<>|*?]+?\.(?:png|jpe?g|gif|webp|bmp|svg|heic|heif|tiff?)/gi;

const MENTION_PATTERN = /@[^\s"'`<>|*?]+?\.(?:png|jpe?g|gif|webp|bmp|svg|heic|heif|tiff?)/gi;

const MARKDOWN_IMAGE_PATTERN = /!\[[^\]]*]\(([^)]+)\)/gi;

function hasImageExtension(value: string): boolean {
  const lower = value.toLowerCase();
  for (const ext of IMAGE_EXTENSIONS) {
    if (lower.endsWith(ext)) {
      return true;
    }
  }
  return false;
}

function normalizeDetectedPath(raw: string): string {
  let value = raw.trim();
  if (value.startsWith("@")) {
    value = value.slice(1);
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith("`") && value.endsWith("`"))
  ) {
    value = value.slice(1, -1);
  }
  return value;
}

function addMatch(
  matches: DetectedImage[],
  seen: Set<string>,
  path: string,
  source: DetectedImage["source"],
  start: number,
  end: number,
): void {
  const normalized = normalizeDetectedPath(path);
  if (!hasImageExtension(normalized)) {
    return;
  }

  const key = normalized.toLowerCase();
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  matches.push({ path: normalized, source, start, end });
}

function collectMarkdownMatches(
  text: string,
  matches: DetectedImage[],
  seen: Set<string>,
): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  const regex = new RegExp(MARKDOWN_IMAGE_PATTERN.source, MARKDOWN_IMAGE_PATTERN.flags);
  for (const match of text.matchAll(regex)) {
    const value = match[1];
    if (!value) {
      continue;
    }
    const start = match.index ?? 0;
    const end = start + match[0].length;
    spans.push({ start, end });
    addMatch(matches, seen, value, "markdown", start, end);
  }
  return spans;
}

function overlapsSpan(
  start: number,
  end: number,
  spans: Array<{ start: number; end: number }>,
): boolean {
  return spans.some((span) => start < span.end && end > span.start);
}

function collectRegexMatches(
  text: string,
  pattern: RegExp,
  source: DetectedImage["source"],
  matches: DetectedImage[],
  seen: Set<string>,
  excludedSpans: Array<{ start: number; end: number }> = [],
): void {
  const regex = new RegExp(pattern.source, pattern.flags);
  for (const match of text.matchAll(regex)) {
    const value = match[0];
    if (!value) {
      continue;
    }
    const start = match.index ?? 0;
    const end = start + value.length;
    if (overlapsSpan(start, end, excludedSpans)) {
      continue;
    }
    addMatch(matches, seen, value, source, start, end);
  }
}

export function detectImagesInText(text: string): DetectedImage[] {
  if (!text.trim()) {
    return [];
  }

  const matches: DetectedImage[] = [];
  const seen = new Set<string>();

  const markdownSpans = collectMarkdownMatches(text, matches, seen);
  collectRegexMatches(text, WINDOWS_PATH_PATTERN, "path", matches, seen, markdownSpans);
  collectRegexMatches(text, POSIX_PATH_PATTERN, "path", matches, seen, markdownSpans);
  collectRegexMatches(text, MENTION_PATTERN, "mention", matches, seen, markdownSpans);

  return matches.sort((left, right) => left.start - right.start);
}

export function messageHasImages(text: string): boolean {
  return detectImagesInText(text).length > 0;
}
