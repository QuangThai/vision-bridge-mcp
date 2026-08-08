import { dirname } from "node:path";
import { buildInterceptMessageText, persistAttachedImages } from "./attached-images.js";
import {
  type InterceptImagesDependencies,
  type InterceptImagesInput,
  type InterceptImagesOptions,
  interceptImagesForTextModel,
} from "./intercept-images.js";
import { isImageFilePath } from "./session-images.js";

/**
 * A content part as produced by a coding-agent tool result. Kept minimal and
 * agent-agnostic so the harness layer does not depend on any client SDK's
 * content types. `type` is either "text" or "image"; image parts carry
 * base64 `data` + `mimeType`.
 */
export interface ToolResultContentPart {
  type: "text" | "image";
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface ToolResultImageInterceptInput {
  /** Model reference used for capability resolution, e.g. `opencode/deepseek-v4-flash-free`. */
  mainModelRef: string;
  /** Optional provider override for capability resolution. */
  providerId?: string;
  /** The tool's original input arguments. `read` exposes `{ path }` here. */
  toolInput?: Record<string, unknown>;
  /** The tool result content. Image parts are persisted and analyzed. */
  content: ToolResultContentPart[];
  /** Runtime vision signal from the client (e.g. pi `ctx.model.input`). */
  runtimeSupportsVision?: boolean;
  /** Session id used to namespace persisted images under the temp dir. */
  sessionId?: string;
  env?: NodeJS.ProcessEnv;
  /** Bypass the native-vision short-circuit (mirrors `ATLAS_FORCE_INTERCEPT`). */
  forceIntercept?: boolean;
}

export interface ToolResultImageInterceptResult {
  intercepted: boolean;
  /** Patched content when interception happened; undefined otherwise. */
  content?: ToolResultContentPart[];
  /** Number of images that were analyzed. */
  analyzedImageCount?: number;
}

function contentText(content: ToolResultContentPart[]): string {
  return content
    .filter(
      (part): part is ToolResultContentPart & { text: string } =>
        part.type === "text" && !!part.text,
    )
    .map((part) => part.text)
    .join("\n");
}

function toolInputImagePaths(toolInput: Record<string, unknown> | undefined): string[] {
  if (!toolInput) {
    return [];
  }
  const paths: string[] = [];
  for (const key of ["path", "file_path", "image_path", "before_path", "after_path"]) {
    const value = toolInput[key];
    if (typeof value === "string" && isImageFilePath(value)) {
      paths.push(value);
    }
  }
  return paths;
}

function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const path of paths) {
    const key = path.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(path);
  }
  return unique;
}

/**
 * Intercept an agent tool result that contains image content but whose main
 * model is text-only. Mirrors the user-prompt interception path, but for
 * images produced mid-turn by tools (screenshots, file reads, clipboard
 * captures) rather than images attached to the user's message.
 *
 * Image sources, in priority order:
 *   1. image content parts (base64) in the tool result — persisted to temp
 *   2. image file paths in the tool input (`read` → `{ path }`, etc.)
 *   3. image paths referenced in the tool result's text content
 *
 * When the model has native vision (and interception is not forced) this
 * returns untouched — the client will attach the image parts itself.
 */
export async function interceptToolResultImage(
  input: ToolResultImageInterceptInput,
  dependencies: InterceptImagesDependencies = {},
): Promise<ToolResultImageInterceptResult> {
  if (input.forceIntercept !== true && input.runtimeSupportsVision === true) {
    return { intercepted: false };
  }

  const content = input.content ?? [];

  // Source 1: image content parts → persist to temp dir.
  const imageParts = content.filter(
    (part): part is ToolResultContentPart & { data: string; mimeType: string } =>
      part.type === "image" && !!part.data && !!part.mimeType,
  );
  const persistedPaths = await persistAttachedImages(
    imageParts.map((part) => ({ type: "image", data: part.data, mimeType: part.mimeType })),
    input.sessionId ?? "tool-result",
  );

  // Source 2: image paths in the tool input.
  const inputPaths = toolInputImagePaths(input.toolInput);

  // Source 3: image paths referenced in the tool result text.
  const textPaths: string[] = [];
  const text = contentText(content);
  if (text.trim()) {
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && isImageFilePath(trimmed)) {
        textPaths.push(trimmed);
      }
    }
  }

  const imagePaths = dedupePaths([...persistedPaths, ...inputPaths, ...textPaths]);
  if (imagePaths.length === 0) {
    return { intercepted: false };
  }

  // The tool already read these files for the session, so the vision provider
  // is allowed to re-read them. Scoped to the exact parent directories.
  const allowedDirs = dedupePaths(imagePaths.map((path) => dirname(path)));

  const interceptInput: InterceptImagesInput = {
    mainModelRef: input.mainModelRef,
    providerId: input.providerId,
    messageText: buildInterceptMessageText(text || "Describe this image.", imagePaths),
    runtimeSupportsVision: input.runtimeSupportsVision,
    env: input.env,
  };
  const interceptOptions: InterceptImagesOptions = {
    forceIntercept: input.forceIntercept,
    skipIntercept: false,
  };

  const result = await interceptImagesForTextModel(interceptInput, interceptOptions, {
    ...dependencies,
    extraAllowedDirs: allowedDirs,
  });

  if (!result.intercepted || result.evidenceBlocks.length === 0) {
    return { intercepted: false };
  }

  const evidence = result.evidenceBlocks.join("\n\n");
  return {
    intercepted: true,
    analyzedImageCount: result.evidenceBlocks.length,
    content: [...content, { type: "text", text: evidence }],
  };
}
