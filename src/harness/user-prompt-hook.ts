import { buildInterceptMessageText } from "./attached-images.js";
import { loadHookEnv } from "./hook-env.js";
import {
  type InterceptImagesDependencies,
  interceptImagesForTextModel,
} from "./intercept-images.js";
import { consumeSessionImages } from "./session-images.js";

export type HookClient = "cursor" | "codex" | "claude" | "droid" | "generic";

export interface UserPromptHookAttachment {
  type?: string;
  path?: string;
  file_path?: string;
}

export interface UserPromptHookInput {
  prompt?: string;
  cwd?: string;
  session_id?: string;
  hook_event_name?: string;
  /** Active model slug from Codex UserPromptSubmit hook input. */
  model?: string;
  attachments?: UserPromptHookAttachment[];
  image_paths?: string[];
}

export interface UserPromptHookOptions {
  client?: HookClient;
  mainModelRef?: string;
  runtimeSupportsVision?: boolean;
  forceIntercept?: boolean;
  skipIntercept?: boolean;
  env?: NodeJS.ProcessEnv;
}

export interface UserPromptHookResult {
  intercepted: boolean;
  stdout: string;
}

function inferProviderFromModelId(modelId: string): string | undefined {
  const lower = modelId.toLowerCase();
  if (lower.startsWith("deepseek")) {
    return "deepseek";
  }
  if (lower.startsWith("glm")) {
    return "glm";
  }
  return undefined;
}

export function resolveMainModelRef(
  input: UserPromptHookInput,
  env: NodeJS.ProcessEnv,
  explicit?: string,
): string | null {
  const fromOption = explicit?.trim();
  if (fromOption) {
    return fromOption;
  }

  const fromEnv = env.MAIN_MODEL_REF?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const hookModel = input.model?.trim();
  if (hookModel) {
    if (hookModel.includes("/")) {
      return hookModel;
    }

    const fallbackProvider = env.MAIN_MODEL_PROVIDER?.trim() || inferProviderFromModelId(hookModel);
    if (fallbackProvider) {
      return `${fallbackProvider}/${hookModel}`;
    }
  }

  const legacyEnv = env.CURSOR_MODEL?.trim() || env.CODEX_MODEL?.trim();
  return legacyEnv || null;
}

function envFlag(env: NodeJS.ProcessEnv, name: string): boolean {
  const value = env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function detectHookClient(
  hookEventName: string | undefined,
  explicit?: HookClient,
): HookClient {
  if (explicit && explicit !== "generic") {
    return explicit;
  }

  switch (hookEventName) {
    case "beforeSubmitPrompt":
      return "cursor";
    case "UserPromptSubmit":
      return "generic";
    default:
      return explicit ?? "generic";
  }
}

export function collectAttachmentPaths(
  attachments: UserPromptHookAttachment[] | undefined,
): string[] {
  if (!attachments || attachments.length === 0) {
    return [];
  }

  const paths: string[] = [];
  for (const attachment of attachments) {
    const path = attachment.path?.trim() || attachment.file_path?.trim();
    if (!path) {
      continue;
    }
    paths.push(path);
  }
  return paths;
}

export function formatUserPromptHookOutput(client: HookClient, additionalContext: string): string {
  if (client === "cursor") {
    return JSON.stringify({ additional_context: additionalContext });
  }

  if (client === "codex" || client === "claude" || client === "droid") {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext,
      },
    });
  }

  return JSON.stringify({ additionalContext });
}

export function parseUserPromptHookInput(raw: string): UserPromptHookInput {
  if (!raw.trim()) {
    return {};
  }

  try {
    return JSON.parse(raw) as UserPromptHookInput;
  } catch {
    return { prompt: raw };
  }
}

export async function runUserPromptHook(
  rawInput: string,
  options: UserPromptHookOptions = {},
  dependencies: InterceptImagesDependencies = {},
): Promise<UserPromptHookResult> {
  const input = parseUserPromptHookInput(rawInput);
  const cwd = input.cwd?.trim() || dependencies.cwd || process.cwd();
  const hookEnv = await loadHookEnv(cwd, options.env ?? process.env);

  if (envFlag(hookEnv, "ATLAS_SKIP_INTERCEPT") || options.skipIntercept) {
    return { intercepted: false, stdout: "" };
  }

  const prompt = input.prompt?.trim() ?? "";
  const client = detectHookClient(input.hook_event_name, options.client);

  const sessionId = input.session_id?.trim();
  const pendingSessionImages = sessionId ? await consumeSessionImages(sessionId) : [];

  const attachmentPaths = [
    ...collectAttachmentPaths(input.attachments),
    ...(input.image_paths ?? []),
    ...pendingSessionImages,
  ];
  const messageText = buildInterceptMessageText(prompt, attachmentPaths);

  const mainModelRef = resolveMainModelRef(input, hookEnv, options.mainModelRef);

  if (!mainModelRef) {
    return { intercepted: false, stdout: "" };
  }

  const runtimeSupportsVision =
    options.runtimeSupportsVision ??
    (envFlag(hookEnv, "ATLAS_FORCE_INTERCEPT") ? false : undefined);

  const result = await interceptImagesForTextModel(
    {
      mainModelRef,
      messageText,
      runtimeSupportsVision,
      env: hookEnv,
    },
    {
      forceIntercept: options.forceIntercept ?? envFlag(hookEnv, "ATLAS_FORCE_INTERCEPT"),
      skipIntercept: options.skipIntercept ?? envFlag(hookEnv, "ATLAS_SKIP_INTERCEPT"),
    },
    { ...dependencies, cwd },
  );

  if (!result.intercepted || result.evidenceBlocks.length === 0) {
    return { intercepted: false, stdout: "" };
  }

  return {
    intercepted: true,
    stdout: formatUserPromptHookOutput(client, result.evidenceBlocks.join("\n\n")),
  };
}
