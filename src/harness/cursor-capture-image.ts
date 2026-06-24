import {
  appendSessionImage,
  isImageFilePath,
  looksLikeCursorAttachedImage,
} from "./session-images.js";

export interface CursorPostToolUseInput {
  session_id?: string;
  conversation_id?: string;
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    path?: string;
  };
  hook_event_name?: string;
}

export function parseCursorPostToolUseInput(raw: string): CursorPostToolUseInput {
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw) as CursorPostToolUseInput;
  } catch {
    return {};
  }
}

export function extractCapturedImagePath(input: CursorPostToolUseInput): string | null {
  if (input.tool_name !== "Write") {
    return null;
  }

  const filePath = input.tool_input?.file_path?.trim() || input.tool_input?.path?.trim();
  if (!filePath || !isImageFilePath(filePath)) {
    return null;
  }

  if (!looksLikeCursorAttachedImage(filePath)) {
    return null;
  }

  return filePath;
}

export async function runCursorCaptureImageHook(rawInput: string): Promise<boolean> {
  const input = parseCursorPostToolUseInput(rawInput);
  const imagePath = extractCapturedImagePath(input);
  if (!imagePath) {
    return false;
  }

  const sessionId = input.session_id?.trim() || input.conversation_id?.trim();
  if (!sessionId) {
    return false;
  }

  await appendSessionImage(sessionId, imagePath);
  return true;
}
