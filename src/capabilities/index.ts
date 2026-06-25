export type {
  CapabilitySource,
  DetectedImage,
  ImageInterceptOptions,
  ImageInterceptPlan,
  InterceptMode,
  ModelCapabilities,
  ModelsDevCacheEntry,
  ModelsDevCatalog,
  ModelsDevModel,
  ModelsDevProvider,
  PlannedVisionCall,
  ProviderVisionPattern,
  VisionCapabilityOverride,
  VisionToolName,
} from "./types.js";

export {
  MODELS_DEV_DEFAULT_TTL_MS,
  MODELS_DEV_DEFAULT_URL,
  ModelsDevClient,
  createModelsDevClient,
  getDefaultModelsDevClient,
  getModelCapabilities,
  parseModelRef,
  type ModelsDevClientOptions,
  type ModelsDevLookupInput,
} from "./models-dev.js";

export { detectImagesInText, messageHasImages } from "./detect-images.js";
export { inferVisionTool, planVisionCalls } from "./infer-tool.js";
export {
  buildInjectedVisionContext,
  planImageIntercept,
  shouldAutoInterceptVision,
  type ImageInterceptInput,
} from "./image-intercept.js";
export {
  VISION_INSTRUCTIONS_PROMPT_DESCRIPTION,
  VISION_INSTRUCTIONS_PROMPT_NAME,
  buildVisionInstructionsPrompt,
} from "./vision-prompt.js";

export {
  PROVIDER_HEURISTICS,
  SPECIFIC_OVERRIDES,
  lookupBundledCapability,
  findHeuristicPattern,
  findSpecificOverride,
} from "./bundled-registry.js";
