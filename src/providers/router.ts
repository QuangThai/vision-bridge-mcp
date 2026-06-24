import type { AtlasConfig } from "../config.js";
import { validateProviderConfig } from "../config.js";
import { ProviderError } from "./errors.js";
import { GeminiProvider } from "./gemini.js";
import { OpenAICompatibleProvider } from "./openai-compatible.js";
import type { FetchFn, VisionProvider } from "./types.js";

export interface CreateVisionProviderOptions {
  fetch?: FetchFn;
}

export function createVisionProvider(
  config: AtlasConfig,
  options: CreateVisionProviderOptions = {},
): VisionProvider {
  validateProviderConfig(config);

  switch (config.vision.provider) {
    case "openai-compatible":
      return new OpenAICompatibleProvider({
        config: config.vision,
        fetch: options.fetch,
      });
    case "gemini":
      return new GeminiProvider({
        config: config.vision,
        fetch: options.fetch,
      });
    default: {
      const unknownProvider: never = config.vision.provider;
      throw new ProviderError(
        `Unsupported vision provider: ${unknownProvider as string}`,
        "invalid_response",
      );
    }
  }
}
