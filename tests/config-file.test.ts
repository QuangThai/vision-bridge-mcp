import { mkdtempSync, writeFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configFileToEnv, loadConfigFileSync } from "../src/config-file.js";
import { loadConfig } from "../src/config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface TestDir {
  path: string;
  cleanup: () => void;
}

function createTestDir(): TestDir {
  const path = mkdtempSync(join(tmpdir(), "atlas-config-test-"));
  return {
    path,
    cleanup: () => {
      try {
        rm(path, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}

function writeConfig(dir: string, name: string, content: string): void {
  writeFileSync(join(dir, name), content, "utf-8");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("configFileToEnv", () => {
  it("converts provider section", () => {
    const env = configFileToEnv({
      provider: {
        api_key: "sk-test-key",
        base_url: "https://custom.api.com/v1",
        model: "gpt-4o",
        temperature: 0.5,
        timeout_ms: 30000,
        max_image_mb: 20,
        max_output_tokens: 8000,
        retry_max: 5,
      },
    });

    expect(env.VISION_API_KEY).toBe("sk-test-key");
    expect(env.VISION_BASE_URL).toBe("https://custom.api.com/v1");
    expect(env.VISION_MODEL).toBe("gpt-4o");
    expect(env.VISION_TEMPERATURE).toBe("0.5");
    expect(env.VISION_TIMEOUT_MS).toBe("30000");
    expect(env.VISION_MAX_IMAGE_MB).toBe("20");
    expect(env.VISION_MAX_OUTPUT_TOKENS).toBe("8000");
    expect(env.VISION_RETRY_MAX).toBe("5");
  });

  it("converts cache section", () => {
    const env = configFileToEnv({
      cache: {
        ttl_hours: 48,
        max_entries: 1000,
        max_size_mb: 200,
        disable: true,
      },
    });

    expect(env.ATLAS_CACHE_TTL_HOURS).toBe("48");
    expect(env.ATLAS_CACHE_MAX_ENTRIES).toBe("1000");
    expect(env.ATLAS_CACHE_MAX_SIZE_MB).toBe("200");
    expect(env.ATLAS_DISABLE_CACHE).toBe("true");
  });

  it("converts atlas section", () => {
    const env = configFileToEnv({
      atlas: {
        allowed_dirs: ["./src", "./assets"],
        log_level: "debug",
        store_history: true,
        log_image_content: true,
        redact_secrets: false,
        check_pii: true,
        default_detail_level: "detailed",
        adaptive_detail: false,
        track_costs: false,
      },
    });

    expect(env.ATLAS_ALLOWED_DIRS).toBe("./src,./assets");
    expect(env.ATLAS_LOG_LEVEL).toBe("debug");
    expect(env.ATLAS_STORE_HISTORY).toBe("true");
    expect(env.ATLAS_LOG_IMAGE_CONTENT).toBe("true");
    expect(env.ATLAS_REDACT_SECRETS).toBe("false");
    expect(env.ATLAS_CHECK_PII).toBe("true");
    expect(env.ATLAS_DEFAULT_DETAIL_LEVEL).toBe("detailed");
    expect(env.ATLAS_ADAPTIVE_DETAIL).toBe("false");
    expect(env.ATLAS_TRACK_COSTS).toBe("false");
  });

  it("returns empty object for empty config", () => {
    const env = configFileToEnv({});
    expect(Object.keys(env)).toHaveLength(0);
  });
});

describe("loadConfig with config file merging", () => {
  let testDir: TestDir;
  let originalCwd: string;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    testDir = createTestDir();
    originalCwd = process.cwd;
    originalEnv = { ...process.env };
    // Use CWD to control config file search
    process.cwd = () => testDir.path;
  });

  afterEach(() => {
    testDir.cleanup();
    process.cwd = originalCwd;
    process.env = originalEnv;

    // Clean up ATLAS_VISION_CONFIG
    process.env.ATLAS_VISION_CONFIG = undefined;
  });

  it("loads config from toml file", async () => {
    const toml = `
[provider]
api_key = "sk-from-toml"
model = "gpt-4o"

[atlas]
adaptive_detail = false
`;

    writeConfig(testDir.path, "atlas-vision.toml", toml);

    const config = loadConfig({});

    expect(config.vision.apiKey).toBe("sk-from-toml");
    expect(config.vision.model).toBe("gpt-4o");
    expect(config.atlas.adaptiveDetail).toBe(false);
    // Defaults still apply for unspecified values
    expect(config.vision.provider).toBe("openai-compatible");
    expect(config.vision.baseUrl).toBe("https://api.openai.com/v1");
  });

  it("loads config from json file", async () => {
    const json = JSON.stringify({
      provider: {
        api_key: "sk-from-json",
        base_url: "https://json.api.com/v1",
      },
      atlas: {
        redact_secrets: false,
      },
    });

    writeConfig(testDir.path, "atlas-vision.json", json);

    const config = loadConfig({});

    expect(config.vision.apiKey).toBe("sk-from-json");
    expect(config.vision.baseUrl).toBe("https://json.api.com/v1");
    expect(config.atlas.redactSecrets).toBe(false);
  });

  it("env var overrides config file value", async () => {
    const toml = `
[provider]
api_key = "sk-from-toml"
model = "gpt-4o"
`;

    writeConfig(testDir.path, "atlas-vision.toml", toml);

    const config = loadConfig({
      VISION_API_KEY: "sk-from-env",
    });

    // Env wins
    expect(config.vision.apiKey).toBe("sk-from-env");
    // Config file fills missing env
    expect(config.vision.model).toBe("gpt-4o");
  });

  it("ATLAS_VISION_CONFIG env overrides search path", async () => {
    // Create config in a non-standard location
    const customDir = createTestDir();
    const customToml = `
[provider]
api_key = "sk-custom-path"
model = "gpt-5.4"
`;

    writeConfig(customDir.path, "custom.toml", customToml);
    const customPath = join(customDir.path, "custom.toml");

    process.env.ATLAS_VISION_CONFIG = customPath;

    const config = loadConfig({});

    expect(config.vision.apiKey).toBe("sk-custom-path");
    expect(config.vision.model).toBe("gpt-5.4");

    customDir.cleanup();
  });

  it("ignores invalid config file and falls back to env vars", () => {
    writeConfig(testDir.path, "atlas-vision.toml", "invalid toml [[[");

    // Invalid config file should not crash — just use defaults
    const config = loadConfig({});
    expect(config.vision.model).toBe("gpt-4o-mini");
    expect(config.vision.provider).toBe("openai-compatible");
  });

  it("partial config file does not overwrite defaults with empty values", async () => {
    const toml = `
[provider]
api_key = ""
`;

    writeConfig(testDir.path, "atlas-vision.toml", toml);

    // Empty string in config file = nothing (not merged since it's an empty string)
    const config = loadConfig({});
    expect(config.vision.apiKey).toBe("");
  });

  it("works with no config file present", () => {
    // No config file in test dir
    const config = loadConfig({});

    // All defaults
    expect(config.vision.model).toBe("gpt-4o-mini");
    expect(config.vision.provider).toBe("openai-compatible");
    expect(config.cache.maxEntries).toBe(500);
  });
});
