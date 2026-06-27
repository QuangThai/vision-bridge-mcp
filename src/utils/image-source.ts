/**
 * Shared utility to resolve the image source from tool input.
 * Each tool accepts either image_path (local file) or image_url (remote URL).
 * Returns the non-empty source string, defaulting to empty string when neither is set.
 */
export function resolveImageSource(input: {
  image_path?: string | null;
  image_url?: string | null;
}): string {
  if (input.image_url?.trim()) {
    return input.image_url.trim();
  }
  return input.image_path?.trim() ?? "";
}
