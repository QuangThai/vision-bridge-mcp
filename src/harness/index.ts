export {
  buildInterceptMessageText,
  collectImagePathsFromPrompt,
  persistAttachedImages,
  type AttachedImageLike,
} from "./attached-images.js";
export {
  extractCapturedImagePath,
  parseCursorPostToolUseInput,
  runCursorCaptureImageHook,
  type CursorPostToolUseInput,
} from "./cursor-capture-image.js";
export {
  executeVisionCall,
  type ExecuteVisionCallDependencies,
  type ExecuteVisionCallResult,
} from "./execute-vision-call.js";
export {
  interceptImagesForTextModel,
  type InterceptImagesDependencies,
  type InterceptImagesInput,
  type InterceptImagesOptions,
  type InterceptImagesResult,
} from "./intercept-images.js";
export {
  hookEnvFileCandidates,
  loadHookEnv,
  parseDotenv,
} from "./hook-env.js";
export {
  appendSessionImage,
  consumeSessionImages,
  isImageFilePath,
  looksLikeCursorAttachedImage,
} from "./session-images.js";
export {
  collectAttachmentPaths,
  detectHookClient,
  formatUserPromptHookOutput,
  type HookClient,
  parseUserPromptHookInput,
  resolveMainModelRef,
  runUserPromptHook,
  type UserPromptHookAttachment,
  type UserPromptHookInput,
  type UserPromptHookOptions,
  type UserPromptHookResult,
} from "./user-prompt-hook.js";
export {
  getClipboardDetectMode,
  readClipboardImage,
  scheduleClipboardCleanup,
  shouldAutoDetectClipboard,
  ENV_CLIPBOARD_DETECT,
} from "./clipboard-image.js";
