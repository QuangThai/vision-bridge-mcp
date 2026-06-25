import { z } from "zod";
import {
  type ConfigFile,
  configFileToEnv,
  getConfigFilePath,
  loadConfigFileSync,
} from "./config-file.js";

const visionProviderSchema = z.enum(["openai-compatible", "gemini"]);

const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);

const detailLevelSchema = z.enum(["brief", "standard", "detailed"]);

const rawEnvSchema = z.object({
  VISION_PROVIDER: visionProviderSchema.default("openai-compatible"),
  VISION_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  VISION_API_KEY: z.string().default(""),
  VISION_MODEL: z.string().min(1).default("gpt-4o-mini"),
  VISION_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.1),
  VISION_TIMEOUT_MS: z.coerce.number().int().positive().max(600_000).default(60_000),
  VISION_MAX_IMAGE_MB: z.coerce.number().positive().max(100).default(10),
  VISION_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().max(128_000).default(4_000),
  VISION_RETRY_MAX: z.coerce.number().int().min(0).max(10).default(3),
  ATLAS_ALLOWED_DIRS: z.string().default("."),
  ATLAS_STORE_HISTORY: z
    .enum(["true", "false", "1", "0"])
    .default("false")
    .transform((value) => value === "true" || value === "1"),
  ATLAS_LOG_LEVEL: logLevelSchema.default("info"),
  ATLAS_LOG_IMAGE_CONTENT: z
    .enum(["true", "false", "1", "0"])
    .default("false")
    .transform((value) => value === "true" || value === "1"),
  ATLAS_REDACT_SECRETS: z
    .enum(["true", "false", "1", "0"])
    .default("true")
    .transform((value) => value === "true" || value === "1"),
  ATLAS_CHECK_PII: z
    .enum(["true", "false", "1", "0"])
    .default("false")
    .transform((value) => value === "true" || value === "1"),
  ATLAS_DEFAULT_DETAIL_LEVEL: detailLevelSchema.default("standard"),
  ATLAS_ADAPTIVE_DETAIL: z
    .enum(["true", "false", "1", "0"])
    .default("true")
    .transform((value) => value === "true" || value === "1"),
  ATLAS_DISABLE_CACHE: z
    .enum(["true", "false", "1", "0"])
    .default("false")
    .transform((value) => value === "true" || value === "1"),
  ATLAS_CACHE_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(24),
  ATLAS_CACHE_MAX_ENTRIES: z.coerce.number().int().min(0).max(100_000).default(500),
  ATLAS_CACHE_MAX_SIZE_MB: z.coerce.number().int().min(0).max(10_000).default(100),
  ATLAS_TRACK_COSTS: z
    .enum(["true", "false", "1", "0"])
    .default("true")
    .transform((value) => value === "true" || value === "1"),
});

export type VisionProviderName = z.infer<typeof visionProviderSchema>;
export type LogLevel = z.infer<typeof logLevelSchema>;
export type DetailLevel = z.infer<typeof detailLevelSchema>;

export interface AtlasConfig {
  vision: {
    provider: VisionProviderName;
    baseUrl: string;
    apiKey: string;
    model: string;
    temperature: number;
    timeoutMs: number;
    maxImageMb: number;
    maxOutputTokens: number;
    retryMax: number;
  };
  atlas: {
    allowedDirs: string[];
    storeHistory: boolean;
    logLevel: LogLevel;
    logImageContent: boolean;
    redactSecrets: boolean;
    checkPii: boolean;
    defaultDetailLevel: DetailLevel;
    adaptiveDetail: boolean;
    trackCosts: boolean;
  };
  cache: {
    disableCache: boolean;
    ttlHours: number;
    maxEntries: number;
    maxSizeMb: number;
  };
}

export class ConfigError extends Error {
  readonly issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "ConfigError";
    this.issues = issues;
  }
}

function parseAllowedDirs(value: string): string[] {
  const dirs = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (dirs.length === 0) {
    throw new ConfigError(
      "ATLAS_ALLOWED_DIRS must include at least one directory. Example: ATLAS_ALLOWED_DIRS=.",
      ["ATLAS_ALLOWED_DIRS: must include at least one directory"],
    );
  }

  return dirs;
}

function toRawEnv(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const keys = [
    "VISION_PROVIDER",
    "VISION_BASE_URL",
    "VISION_API_KEY",
    "VISION_MODEL",
    "VISION_TEMPERATURE",
    "VISION_TIMEOUT_MS",
    "VISION_MAX_IMAGE_MB",
    "VISION_MAX_OUTPUT_TOKENS",
    "VISION_RETRY_MAX",
    "ATLAS_ALLOWED_DIRS",
    "ATLAS_STORE_HISTORY",
    "ATLAS_LOG_LEVEL",
    "ATLAS_LOG_IMAGE_CONTENT",
    "ATLAS_REDACT_SECRETS",
    "ATLAS_CHECK_PII",
    "ATLAS_DEFAULT_DETAIL_LEVEL",
    "ATLAS_ADAPTIVE_DETAIL",
    "ATLAS_DISABLE_CACHE",
    "ATLAS_CACHE_TTL_HOURS",
    "ATLAS_CACHE_MAX_ENTRIES",
    "ATLAS_CACHE_MAX_SIZE_MB",
    "ATLAS_TRACK_COSTS",
  ] as const;

  const raw: Record<string, string | undefined> = {};
  for (const key of keys) {
    const value = env[key];
    raw[key] = value === "" ? undefined : value;
  }
  return raw;
}

function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

function toAtlasConfig(parsed: z.infer<typeof rawEnvSchema>): AtlasConfig {
  return {
    vision: {
      provider: parsed.VISION_PROVIDER,
      baseUrl: parsed.VISION_BASE_URL,
      apiKey: parsed.VISION_API_KEY,
      model: parsed.VISION_MODEL,
      temperature: parsed.VISION_TEMPERATURE,
      timeoutMs: parsed.VISION_TIMEOUT_MS,
      maxImageMb: parsed.VISION_MAX_IMAGE_MB,
      maxOutputTokens: parsed.VISION_MAX_OUTPUT_TOKENS,
      retryMax: parsed.VISION_RETRY_MAX,
    },
    atlas: {
      allowedDirs: parseAllowedDirs(parsed.ATLAS_ALLOWED_DIRS),
      storeHistory: parsed.ATLAS_STORE_HISTORY,
      logLevel: parsed.ATLAS_LOG_LEVEL,
      logImageContent: parsed.ATLAS_LOG_IMAGE_CONTENT,
      redactSecrets: parsed.ATLAS_REDACT_SECRETS,
      checkPii: parsed.ATLAS_CHECK_PII,
      defaultDetailLevel: parsed.ATLAS_DEFAULT_DETAIL_LEVEL,
      adaptiveDetail: parsed.ATLAS_ADAPTIVE_DETAIL,
      trackCosts: parsed.ATLAS_TRACK_COSTS,
    },
    cache: {
      disableCache: parsed.ATLAS_DISABLE_CACHE,
      ttlHours: parsed.ATLAS_CACHE_TTL_HOURS,
      maxEntries: parsed.ATLAS_CACHE_MAX_ENTRIES,
      maxSizeMb: parsed.ATLAS_CACHE_MAX_SIZE_MB,
    },
  };
}

/**
 * Merge config file values into raw env map.
 * Env vars always take priority over config file values.
 */
function mergeConfigFile(
  raw: Record<string, string | undefined>,
  configFile: ConfigFile | null,
): Record<string, string | undefined> {
  if (!configFile) return raw;

  const fromConfig = configFileToEnv(configFile);
  const merged: Record<string, string | undefined> = { ...raw };

  // Config file fills in gaps that env vars didn't set
  for (const [key, value] of Object.entries(fromConfig)) {
    if (merged[key] === undefined) {
      merged[key] = value;
    }
  }

  return merged;
}

/**
 * Load and return the resolved config file path (or null).
 * This is useful for the `config path` CLI command to show which file is active.
 */
export function getActiveConfigPath(): string | null {
  return getConfigFilePath();
}

function tryLoadConfigFile(): ConfigFile | null {
  try {
    return loadConfigFileSync();
  } catch (err) {
    console.warn(
      `[atlas-vision] Warning: ignoring invalid config file (${err instanceof Error ? err.message : String(err)})`,
    );
    return null;
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AtlasConfig {
  const configFile = tryLoadConfigFile();
  const mergedEnv = mergeConfigFile(toRawEnv(env), configFile);

  const result = rawEnvSchema.safeParse(mergedEnv);
  if (!result.success) {
    const issues = formatZodIssues(result.error);
    throw new ConfigError(
      `Invalid configuration:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
      issues,
    );
  }

  try {
    return toAtlasConfig(result.data);
  } catch (error) {
    if (error instanceof ConfigError) {
      throw error;
    }
    throw error;
  }
}

export function validateProviderConfig(config: AtlasConfig): void {
  if (!config.vision.apiKey.trim()) {
    throw new ConfigError(
      "VISION_API_KEY is required for vision provider calls. Set VISION_API_KEY in your MCP server environment.",
      ["VISION_API_KEY: required for provider requests"],
    );
  }

  if (!config.vision.baseUrl.trim()) {
    throw new ConfigError("VISION_BASE_URL is required. Example: https://api.openai.com/v1", [
      "VISION_BASE_URL: required",
    ]);
  }
}
