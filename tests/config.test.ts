import { afterEach, describe, expect, it } from "vitest";
import { ConfigError, loadConfig, validateProviderConfig } from "../src/config.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("loadConfig", () => {
  it("applies product defaults", () => {
    const config = loadConfig({});

    expect(config.vision.provider).toBe("openai-compatible");
    expect(config.vision.baseUrl).toBe("https://api.openai.com/v1");
    expect(config.vision.model).toBe("gpt-4o-mini");
    expect(config.vision.timeoutMs).toBe(60_000);
    expect(config.vision.maxImageMb).toBe(10);
    expect(config.vision.maxOutputTokens).toBe(4_000);
    expect(config.atlas.allowedDirs).toEqual(["."]);
    expect(config.atlas.storeHistory).toBe(false);
    expect(config.atlas.logLevel).toBe("info");
    expect(config.atlas.logImageContent).toBe(false);
    expect(config.atlas.redactSecrets).toBe(true);
    expect(config.atlas.checkPii).toBe(false);
    expect(config.atlas.defaultDetailLevel).toBe("standard");
  });

  it("parses custom env values", () => {
    const config = loadConfig({
      VISION_API_KEY: "test-key",
      VISION_MODEL: "gpt-4o",
      ATLAS_ALLOWED_DIRS: "./src,./assets",
      ATLAS_LOG_IMAGE_CONTENT: "true",
      ATLAS_REDACT_SECRETS: "0",
      ATLAS_CHECK_PII: "true",
    });

    expect(config.vision.apiKey).toBe("test-key");
    expect(config.vision.model).toBe("gpt-4o");
    expect(config.atlas.allowedDirs).toEqual(["./src", "./assets"]);
    expect(config.atlas.logImageContent).toBe(true);
    expect(config.atlas.redactSecrets).toBe(false);
    expect(config.atlas.checkPii).toBe(true);
  });

  it("rejects invalid numeric limits", () => {
    expect(() =>
      loadConfig({
        VISION_TIMEOUT_MS: "-1",
      }),
    ).toThrow(ConfigError);

    try {
      loadConfig({ VISION_MAX_IMAGE_MB: "0" });
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).issues.length).toBeGreaterThan(0);
    }
  });

  it("rejects invalid base URL", () => {
    expect(() =>
      loadConfig({
        VISION_BASE_URL: "not-a-url",
      }),
    ).toThrow(ConfigError);
  });
});

describe("validateProviderConfig", () => {
  it("requires API key for provider calls", () => {
    const config = loadConfig({ VISION_API_KEY: "" });

    expect(() => validateProviderConfig(config)).toThrow(ConfigError);
    expect(() => validateProviderConfig(config)).toThrow(/VISION_API_KEY is required/);
  });

  it("passes when API key is set", () => {
    const config = loadConfig({ VISION_API_KEY: "sk-test" });
    expect(() => validateProviderConfig(config)).not.toThrow();
  });
});
