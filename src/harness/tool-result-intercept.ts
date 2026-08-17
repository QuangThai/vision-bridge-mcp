import { createHash } from "node:crypto";
import {
  type AttachedImageLike,
  buildInterceptMessageText,
  persistTemporaryAttachedImages,
} from "./attached-images.js";
import {
  type InterceptImagesDependencies,
  type InterceptImagesInput,
  type InterceptImagesOptions,
  interceptImagesForTextModel,
} from "./intercept-images.js";
import { isImageFilePath } from "./session-images.js";

export interface ToolResultTextContentPart {
  type: "text";
  text: string;
}

export interface ToolResultImageContentPart {
  type: "image";
  data: string;
  mimeType: string;
}

/** Structural equivalent of Pi's current TextContent | ImageContent contract. */
export type ToolResultContentPart = ToolResultTextContentPart | ToolResultImageContentPart;

export interface ToolResultImageInterceptInput {
  /** Model reference used for capability resolution, e.g. `deepseek/deepseek-v4-flash`. */
  mainModelRef: string;
  /** Optional provider override for capability resolution. */
  providerId?: string;
  /** Tool provenance from the client tool-result event. */
  toolName: string;
  toolCallId: string;
  toolInput: Record<string, unknown>;
  isError: boolean;
  /** Tool result content. Explicit image blocks are the canonical image source. */
  content: ToolResultContentPart[];
  /** Runtime vision signal from the client (e.g. Pi `ctx.model.input`). */
  runtimeSupportsVision?: boolean;
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

type ToolResultImageCandidateInput = Pick<
  ToolResultImageInterceptInput,
  "content" | "isError" | "toolInput" | "toolName"
>;

function contentText(content: ToolResultContentPart[]): string {
  return content
    .filter(
      (part): part is ToolResultTextContentPart =>
        part.type === "text" && typeof part.text === "string" && part.text.length > 0,
    )
    .map((part) => part.text)
    .join("\n");
}

function isValidImagePart(part: ToolResultContentPart): part is ToolResultImageContentPart {
  return (
    part.type === "image" &&
    typeof part.data === "string" &&
    part.data.trim().length > 0 &&
    typeof part.mimeType === "string" &&
    part.mimeType.trim().length > 0
  );
}

function collectImageParts(content: ToolResultContentPart[]): AttachedImageLike[] {
  const seen = new Set<string>();
  const images: AttachedImageLike[] = [];

  for (const part of content) {
    if (!isValidImagePart(part)) {
      continue;
    }

    const digest = createHash("sha256")
      .update(part.mimeType.toLowerCase())
      .update("\0")
      .update(part.data)
      .digest("hex");
    if (seen.has(digest)) {
      continue;
    }

    seen.add(digest);
    images.push({ type: "image", data: part.data, mimeType: part.mimeType });
  }

  return images;
}

function readToolFallbackPath(input: ToolResultImageCandidateInput): string | null {
  if (input.toolName !== "read" || input.isError) {
    return null;
  }

  const value = input.toolInput.path ?? input.toolInput.file_path;
  return typeof value === "string" && isImageFilePath(value) ? value : null;
}

/** Cheap preflight used by client extensions to avoid status flicker on unrelated tool results. */
export function hasToolResultImageCandidate(input: ToolResultImageCandidateInput): boolean {
  return input.content.some(isValidImagePart) || readToolFallbackPath(input) !== null;
}

/**
 * Convert explicit images emitted by an agent tool into text evidence for a
 * text-only main model.
 *
 * Explicit image blocks are canonical. If at least one exists, Atlas analyzes
 * unique temporary copies and ignores path-like tool input or text, preventing
 * duplicate calls. The only path fallback is a successful `read` result with
 * no image block; that path remains subject to `ATLAS_ALLOWED_DIRS` in the
 * normal vision pipeline.
 */
export async function interceptToolResultImage(
  input: ToolResultImageInterceptInput,
  dependencies: InterceptImagesDependencies = {},
): Promise<ToolResultImageInterceptResult> {
  if (input.forceIntercept !== true && input.runtimeSupportsVision === true) {
    return { intercepted: false };
  }

  dependencies.signal?.throwIfAborted();

  const content = input.content ?? [];
  const imageParts = collectImageParts(content);
  const temporary = await persistTemporaryAttachedImages(imageParts, input.toolCallId);

  try {
    const readFallback = imageParts.length === 0 ? readToolFallbackPath(input) : null;
    const imagePaths =
      temporary.paths.length > 0 ? temporary.paths : readFallback ? [readFallback] : [];
    if (imagePaths.length === 0) {
      return { intercepted: false };
    }

    const text = contentText(content);
    const interceptInput: InterceptImagesInput = {
      mainModelRef: input.mainModelRef,
      providerId: input.providerId,
      messageText: buildInterceptMessageText(
        text || "Describe this tool-result image.",
        imagePaths,
      ),
      runtimeSupportsVision: input.runtimeSupportsVision,
      env: input.env,
    };
    const interceptOptions: InterceptImagesOptions = {
      forceIntercept: input.forceIntercept,
      skipIntercept: false,
    };

    const result = await interceptImagesForTextModel(
      interceptInput,
      interceptOptions,
      dependencies,
    );
    if (!result.intercepted || result.evidenceBlocks.length === 0) {
      return { intercepted: false };
    }

    return {
      intercepted: true,
      analyzedImageCount: result.evidenceBlocks.length,
      content: [...content, { type: "text", text: result.evidenceBlocks.join("\n\n") }],
    };
  } finally {
    await temporary.cleanup();
  }
}
