import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { parse as parseToml } from "smol-toml";

// ---------------------------------------------------------------------------
// Config file schema
// ---------------------------------------------------------------------------

export interface ConfigFileProvider {
  api_key?: string;
  base_url?: string;
  model?: string;
  temperature?: number;
  timeout_ms?: number;
  max_image_mb?: number;
  max_output_tokens?: number;
  retry_max?: number;
  /** Optional fallback provider */
  fallback?: {
    provider?: string;
    api_key?: string;
    base_url?: string;
    model?: string;
  };
}

export interface ConfigFileCache {
  ttl_hours?: number;
  max_entries?: number;
  max_size_mb?: number;
  disable?: boolean;
}

export interface ConfigFileAtlas {
  allowed_dirs?: string[];
  log_level?: string;
  store_history?: boolean;
  log_image_content?: boolean;
  redact_secrets?: boolean;
  check_pii?: boolean;
  default_detail_level?: string;
  adaptive_detail?: boolean;
  track_costs?: boolean;
}

export interface ConfigFile {
  provider?: ConfigFileProvider;
  cache?: ConfigFileCache;
  atlas?: ConfigFileAtlas;
  /** Schema version for future compatibility */
  config_version?: string;
}

// ---------------------------------------------------------------------------
// Search paths
// ---------------------------------------------------------------------------

const CANDIDATE_FILES = [
  // project-level (preferred)
  "atlas-vision.toml",
  "atlas-vision.json",
  // user-level
  resolve(homedir(), ".config/atlas-vision/config.toml"),
  resolve(homedir(), ".config/atlas-vision/config.json"),
];

/**
 * Resolve config file path.
 * Priority: ATLAS_VISION_CONFIG env → local toml/json → user-level toml/json
 */
function resolveConfigPath(): string | null {
  const envPath = process.env.ATLAS_VISION_CONFIG?.trim();
  if (envPath) {
    return resolve(process.cwd(), envPath);
  }

  for (const candidate of CANDIDATE_FILES) {
    const absPath = resolve(process.cwd(), candidate);
    if (existsSync(absPath)) {
      return absPath;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function tryParseJson(content: string): unknown {
  return JSON.parse(content);
}

function tryParseToml(content: string): unknown {
  return parseToml(content);
}

function isTomlPath(path: string): boolean {
  return path.endsWith(".toml");
}

function validateConfigFile(raw: unknown): ConfigFile {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Config file must be a JSON/Toml object");
  }

  const obj = raw as Record<string, unknown>;

  const result: ConfigFile = {};

  // Warn about unknown top-level keys (likely typos like `[provder]`)
  const knownKeys = new Set(["config_version", "provider", "cache", "atlas"]);
  for (const key of Object.keys(obj)) {
    if (!knownKeys.has(key)) {
      console.warn(
        `[atlas-vision] Warning: unknown config section "${key}" — did you mean one of: ${Array.from(knownKeys).join(", ")}?`,
      );
      break; // only warn once per file
    }
  }

  if (obj.config_version !== undefined) {
    if (typeof obj.config_version !== "string") {
      throw new Error('"config_version" must be a string');
    }
    result.config_version = obj.config_version;
  }

  // ── provider section ────────────────────────────────────────
  if (obj.provider !== undefined) {
    if (typeof obj.provider !== "object" || obj.provider === null) {
      throw new Error('"provider" must be an object');
    }
    const p = obj.provider as Record<string, unknown>;
    const provider: ConfigFileProvider = {};

    if (p.api_key !== undefined) {
      if (typeof p.api_key !== "string") throw new Error("provider.api_key must be a string");
      provider.api_key = p.api_key;
    }
    if (p.base_url !== undefined) {
      if (typeof p.base_url !== "string") throw new Error("provider.base_url must be a string");
      provider.base_url = p.base_url;
    }
    if (p.model !== undefined) {
      if (typeof p.model !== "string") throw new Error("provider.model must be a string");
      provider.model = p.model;
    }
    if (p.temperature !== undefined) {
      if (typeof p.temperature !== "number")
        throw new Error("provider.temperature must be a number");
      provider.temperature = p.temperature;
    }
    if (p.timeout_ms !== undefined) {
      if (typeof p.timeout_ms !== "number") throw new Error("provider.timeout_ms must be a number");
      provider.timeout_ms = p.timeout_ms;
    }
    if (p.max_image_mb !== undefined) {
      if (typeof p.max_image_mb !== "number")
        throw new Error("provider.max_image_mb must be a number");
      provider.max_image_mb = p.max_image_mb;
    }
    if (p.max_output_tokens !== undefined) {
      if (typeof p.max_output_tokens !== "number")
        throw new Error("provider.max_output_tokens must be a number");
      provider.max_output_tokens = p.max_output_tokens;
    }
    if (p.retry_max !== undefined) {
      if (typeof p.retry_max !== "number") throw new Error("provider.retry_max must be a number");
      provider.retry_max = p.retry_max;
    }

    // Fallback provider
    if (p.fallback !== undefined) {
      if (typeof p.fallback !== "object" || p.fallback === null) {
        throw new Error("provider.fallback must be an object");
      }
      const f = p.fallback as Record<string, unknown>;
      const fb: { provider?: string; api_key?: string; base_url?: string; model?: string } = {};
      if (f.provider !== undefined) {
        if (typeof f.provider !== "string")
          throw new Error("provider.fallback.provider must be a string");
        fb.provider = f.provider;
      }
      if (f.api_key !== undefined) {
        if (typeof f.api_key !== "string")
          throw new Error("provider.fallback.api_key must be a string");
        fb.api_key = f.api_key;
      }
      if (f.base_url !== undefined) {
        if (typeof f.base_url !== "string")
          throw new Error("provider.fallback.base_url must be a string");
        fb.base_url = f.base_url;
      }
      if (f.model !== undefined) {
        if (typeof f.model !== "string")
          throw new Error("provider.fallback.model must be a string");
        fb.model = f.model;
      }
      provider.fallback = fb;
    }

    result.provider = provider;
  }

  // ── cache section ───────────────────────────────────────────
  if (obj.cache !== undefined) {
    if (typeof obj.cache !== "object" || obj.cache === null) {
      throw new Error('"cache" must be an object');
    }
    const c = obj.cache as Record<string, unknown>;
    const cache: ConfigFileCache = {};

    if (c.ttl_hours !== undefined) {
      if (typeof c.ttl_hours !== "number") throw new Error("cache.ttl_hours must be a number");
      cache.ttl_hours = c.ttl_hours;
    }
    if (c.max_entries !== undefined) {
      if (typeof c.max_entries !== "number") throw new Error("cache.max_entries must be a number");
      cache.max_entries = c.max_entries;
    }
    if (c.max_size_mb !== undefined) {
      if (typeof c.max_size_mb !== "number") throw new Error("cache.max_size_mb must be a number");
      cache.max_size_mb = c.max_size_mb;
    }
    if (c.disable !== undefined) {
      if (typeof c.disable !== "boolean") throw new Error("cache.disable must be a boolean");
      cache.disable = c.disable;
    }

    result.cache = cache;
  }

  // ── atlas section ───────────────────────────────────────────
  if (obj.atlas !== undefined) {
    if (typeof obj.atlas !== "object" || obj.atlas === null) {
      throw new Error('"atlas" must be an object');
    }
    const a = obj.atlas as Record<string, unknown>;
    const atlas: ConfigFileAtlas = {};

    if (a.allowed_dirs !== undefined) {
      if (!Array.isArray(a.allowed_dirs))
        throw new Error("atlas.allowed_dirs must be an array of strings");
      atlas.allowed_dirs = a.allowed_dirs.filter((d: unknown) => typeof d === "string");
    }
    if (a.log_level !== undefined) {
      if (typeof a.log_level !== "string") throw new Error("atlas.log_level must be a string");
      atlas.log_level = a.log_level;
    }
    if (a.store_history !== undefined) {
      if (typeof a.store_history !== "boolean")
        throw new Error("atlas.store_history must be a boolean");
      atlas.store_history = a.store_history;
    }
    if (a.log_image_content !== undefined) {
      if (typeof a.log_image_content !== "boolean")
        throw new Error("atlas.log_image_content must be a boolean");
      atlas.log_image_content = a.log_image_content;
    }
    if (a.redact_secrets !== undefined) {
      if (typeof a.redact_secrets !== "boolean")
        throw new Error("atlas.redact_secrets must be a boolean");
      atlas.redact_secrets = a.redact_secrets;
    }
    if (a.check_pii !== undefined) {
      if (typeof a.check_pii !== "boolean") throw new Error("atlas.check_pii must be a boolean");
      atlas.check_pii = a.check_pii;
    }
    if (a.default_detail_level !== undefined) {
      if (typeof a.default_detail_level !== "string")
        throw new Error("atlas.default_detail_level must be a string");
      atlas.default_detail_level = a.default_detail_level;
    }
    if (a.adaptive_detail !== undefined) {
      if (typeof a.adaptive_detail !== "boolean")
        throw new Error("atlas.adaptive_detail must be a boolean");
      atlas.adaptive_detail = a.adaptive_detail;
    }
    if (a.track_costs !== undefined) {
      if (typeof a.track_costs !== "boolean")
        throw new Error("atlas.track_costs must be a boolean");
      atlas.track_costs = a.track_costs;
    }

    result.atlas = atlas;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Load & convert to env-like flat map
// ---------------------------------------------------------------------------

/**
 * Load config file from search paths.
 * Returns `null` if no config file found.
 */
export async function loadConfigFile(): Promise<ConfigFile | null> {
  const configPath = resolveConfigPath();
  if (!configPath) return null;

  const content = await readFile(configPath, "utf-8");
  let raw: unknown;

  try {
    if (isTomlPath(configPath)) {
      raw = tryParseToml(content);
    } else {
      raw = tryParseJson(content);
    }
  } catch (parseError) {
    throw new Error(
      `Failed to parse config file ${configPath}: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
    );
  }

  return validateConfigFile(raw);
}

/**
 * Synchronous version for CLI commands / tests that don't want async.
 */
export function loadConfigFileSync(): ConfigFile | null {
  const configPath = resolveConfigPath();
  if (!configPath) return null;

  const content = readFileSync(configPath, "utf-8");
  let raw: unknown;

  try {
    if (isTomlPath(configPath)) {
      raw = tryParseToml(content);
    } else {
      raw = tryParseJson(content);
    }
  } catch (parseError) {
    throw new Error(
      `Failed to parse config file ${configPath}: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
    );
  }

  return validateConfigFile(raw);
}

/**
 * Get the resolved config file path, or null if none found.
 */
export function getConfigFilePath(): string | null {
  return resolveConfigPath();
}

// ---------------------------------------------------------------------------
// Convert ConfigFile → flat env-like Record for merging with env vars
// ---------------------------------------------------------------------------

/**
 * Convert a `ConfigFile` into a flat `Record<string, string>` suitable for
 * merging with env vars before passing to the Zod schema.
 *
 * Env vars take priority over config file values, so this is used as fallback.
 */
export function configFileToEnv(configFile: ConfigFile): Record<string, string> {
  const env: Record<string, string> = {};

  if (configFile.provider) {
    const p = configFile.provider;
    if (p.api_key !== undefined) env.VISION_API_KEY = p.api_key;
    if (p.base_url !== undefined) env.VISION_BASE_URL = p.base_url;
    if (p.model !== undefined) env.VISION_MODEL = p.model;
    if (p.temperature !== undefined) env.VISION_TEMPERATURE = String(p.temperature);
    if (p.timeout_ms !== undefined) env.VISION_TIMEOUT_MS = String(p.timeout_ms);
    if (p.max_image_mb !== undefined) env.VISION_MAX_IMAGE_MB = String(p.max_image_mb);
    if (p.max_output_tokens !== undefined)
      env.VISION_MAX_OUTPUT_TOKENS = String(p.max_output_tokens);
    if (p.retry_max !== undefined) env.VISION_RETRY_MAX = String(p.retry_max);

    // Fallback provider
    if (p.fallback) {
      const f = p.fallback;
      if (f.provider !== undefined) env.VISION_FALLBACK_PROVIDER = f.provider;
      if (f.api_key !== undefined) env.VISION_FALLBACK_API_KEY = f.api_key;
      if (f.base_url !== undefined) env.VISION_FALLBACK_BASE_URL = f.base_url;
      if (f.model !== undefined) env.VISION_FALLBACK_MODEL = f.model;
    }
  }

  if (configFile.cache) {
    const c = configFile.cache;
    if (c.ttl_hours !== undefined) env.ATLAS_CACHE_TTL_HOURS = String(c.ttl_hours);
    if (c.max_entries !== undefined) env.ATLAS_CACHE_MAX_ENTRIES = String(c.max_entries);
    if (c.max_size_mb !== undefined) env.ATLAS_CACHE_MAX_SIZE_MB = String(c.max_size_mb);
    if (c.disable !== undefined) env.ATLAS_DISABLE_CACHE = c.disable ? "true" : "false";
  }

  if (configFile.atlas) {
    const a = configFile.atlas;
    if (a.allowed_dirs !== undefined) env.ATLAS_ALLOWED_DIRS = a.allowed_dirs.join(",");
    if (a.log_level !== undefined) env.ATLAS_LOG_LEVEL = a.log_level;
    if (a.store_history !== undefined) env.ATLAS_STORE_HISTORY = a.store_history ? "true" : "false";
    if (a.log_image_content !== undefined)
      env.ATLAS_LOG_IMAGE_CONTENT = a.log_image_content ? "true" : "false";
    if (a.redact_secrets !== undefined)
      env.ATLAS_REDACT_SECRETS = a.redact_secrets ? "true" : "false";
    if (a.check_pii !== undefined) env.ATLAS_CHECK_PII = a.check_pii ? "true" : "false";
    if (a.default_detail_level !== undefined)
      env.ATLAS_DEFAULT_DETAIL_LEVEL = a.default_detail_level;
    if (a.adaptive_detail !== undefined)
      env.ATLAS_ADAPTIVE_DETAIL = a.adaptive_detail ? "true" : "false";
    if (a.track_costs !== undefined) env.ATLAS_TRACK_COSTS = a.track_costs ? "true" : "false";
  }

  return env;
}
