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
    expect(config.vision.timeoutMs).toBe(300_000);
    expect(config.vision.maxImageMb).toBe(10);
    expect(config.vision.maxOutputTokens).toBe(4_000);
    expect(config.atlas.allowedDirs).toEqual(["."]);
    expect(config.atlas.storeHistory).toBe(false);
    expect(config.atlas.logLevel).toBe("info");
    expect(config.atlas.logImageContent).toBe(false);
    expect(config.atlas.redactSecrets).toBe(true);
    expect(config.atlas.checkPii).toBe(false);
    expect(config.atlas.defaultDetailLevel).toBe("standard");
    expect(config.vision.responsesThinking).toBe("disabled");
    expect(config.vision.responsesStore).toBe(true);
    expect(config.vision.responsesEffort).toBe("minimal");
  });

  it("parses Responses-API-specific env values", () => {
    const config = loadConfig({
      VISION_RESPONSES_THINKING: "enabled",
      VISION_RESPONSES_STORE: "false",
      VISION_RESPONSES_EFFORT: "high",
    });

    expect(config.vision.responsesThinking).toBe("enabled");
    expect(config.vision.responsesStore).toBe(false);
    expect(config.vision.responsesEffort).toBe("high");
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

describe("base URL scheme policy", () => {
  it("accepts https for public hosts", () => {
    const config = loadConfig({
      VISION_BASE_URL: "https://api.openai.com/v1",
    });
    expect(config.vision.baseUrl).toBe("https://api.openai.com/v1");
  });

  it("accepts http for loopback hosts", () => {
    for (const url of [
      "http://127.0.0.1:18317/v1",
      "http://localhost:8317/v1",
      "http://[::1]:8317/v1",
      "http://0.0.0.0:8317/v1",
    ]) {
      const config = loadConfig({ VISION_BASE_URL: url });
      expect(config.vision.baseUrl).toBe(url);
    }
  });

  it("accepts http for private-network hosts", () => {
    for (const url of [
      "http://10.0.0.5:8080/v1",
      "http://192.168.1.10:8080/v1",
      "http://172.16.4.2:8080/v1",
      "http://172.31.255.254:8080/v1",
      "http://169.254.169.254:8080/v1",
    ]) {
      const config = loadConfig({ VISION_BASE_URL: url });
      expect(config.vision.baseUrl).toBe(url);
    }
  });

  it("rejects http for public hosts", () => {
    for (const url of [
      "http://api.openai.com/v1",
      "http://example.com/v1",
      "http://8.8.8.8/v1",
      "http://172.15.0.1/v1",
      "http://172.32.0.1/v1",
    ]) {
      expect(() => loadConfig({ VISION_BASE_URL: url })).toThrow(ConfigError);
    }
  });

  it("rejects non-http(s) schemes", () => {
    expect(() => loadConfig({ VISION_BASE_URL: "ftp://example.com/v1" })).toThrow(ConfigError);
  });

  it("applies the same policy to the fallback base URL", () => {
    const accepted = loadConfig({
      VISION_FALLBACK_PROVIDER: "openai-compatible",
      VISION_FALLBACK_API_KEY: "sk-test",
      VISION_FALLBACK_BASE_URL: "http://127.0.0.1:18317/v1",
    });
    expect(accepted.vision.fallback?.baseUrl).toBe("http://127.0.0.1:18317/v1");

    expect(() =>
      loadConfig({
        VISION_FALLBACK_PROVIDER: "openai-compatible",
        VISION_FALLBACK_API_KEY: "sk-test",
        VISION_FALLBACK_BASE_URL: "http://api.openai.com/v1",
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
