import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfigFileSync } from "../config-file.js";
import { getActiveConfigPath, loadConfig } from "../config.js";
import { getFlagString, hasFlag, parseArgs } from "./parse-args.js";

// ---------------------------------------------------------------------------
// Default config file template
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG_TOML = `# Atlas Vision MCP — configuration file
#
# Config file is optional. When present, it fills in defaults that env vars
# can still override (env vars always take priority).
#
# Supported formats: atlas-vision.toml (preferred), atlas-vision.json
#
# Installation paths (checked in order):
#   1. ATLAS_VISION_CONFIG env var (explicit path)
#   2. ./atlas-vision.toml (project-level)
#   3. ./atlas-vision.json  (project-level)
#   4. ~/.config/atlas-vision/config.toml (user-level)
#   5. ~/.config/atlas-vision/config.json  (user-level)
#
# Only the first found file is used.

[provider]
# API key (env: VISION_API_KEY)
api_key = ""

# Provider base URL (env: VISION_BASE_URL)
# openai-compatible: https://api.openai.com/v1
# gemini: https://generativelanguage.googleapis.com/v1beta
base_url = "https://api.openai.com/v1"

# Vision model (env: VISION_MODEL)
model = "gpt-4o-mini"

# Provider type: "openai-compatible" or "gemini" (env: VISION_PROVIDER)
# provider = "openai-compatible"

# Temperature 0.0–2.0 (env: VISION_TEMPERATURE)
# temperature = 0.1

# Request timeout in ms (env: VISION_TIMEOUT_MS)
# timeout_ms = 60000

# Max uploaded image size in MB (env: VISION_MAX_IMAGE_MB)
# max_image_mb = 10

# Max output tokens (env: VISION_MAX_OUTPUT_TOKENS)
# max_output_tokens = 4000

# Retry count for transient failures (env: VISION_RETRY_MAX)
# retry_max = 3

[cache]
# Cache TTL in hours (env: ATLAS_CACHE_TTL_HOURS)
# ttl_hours = 24

# Max cache entries (env: ATLAS_CACHE_MAX_ENTRIES)
# max_entries = 500

# Max cache size in MB (env: ATLAS_CACHE_MAX_SIZE_MB)
# max_size_mb = 100

# Disable caching entirely (env: ATLAS_DISABLE_CACHE)
# disable = false

[atlas]
# Directories allowed for image access (env: ATLAS_ALLOWED_DIRS)
allowed_dirs = ["."]

# Log level: debug | info | warn | error (env: ATLAS_LOG_LEVEL)
# log_level = "info"

# Redact secrets from vision responses (env: ATLAS_REDACT_SECRETS)
# redact_secrets = true

# Enable adaptive detail level auto-detection (env: ATLAS_ADAPTIVE_DETAIL)
# adaptive_detail = true

# Default detail level: brief | standard | detailed (env: ATLAS_DEFAULT_DETAIL_LEVEL)
# default_detail_level = "standard"

# Check PII in images (env: ATLAS_CHECK_PII)
# check_pii = false

# Track vision API costs (env: ATLAS_TRACK_COSTS)
# track_costs = true
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskSecret(value: string): string {
  if (!value) return "(not set)";
  if (value.length <= 8) return "(set)";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// CLI command
// ---------------------------------------------------------------------------

export async function runConfigCommand(args: string[]): Promise<number> {
  const { positional, flags } = parseArgs(args);
  const subcommand = positional[0];

  // ── config path ──────────────────────────────────────────────
  if (subcommand === "path") {
    const configPath = getActiveConfigPath();
    if (configPath) {
      console.log(configPath);
    } else {
      console.log("No config file found.");
      console.log("Run: atlas-vision config init");
    }
    return 0;
  }

  // ── config init ──────────────────────────────────────────────
  if (subcommand === "init") {
    const outputPath = resolve(
      process.cwd(),
      getFlagString(flags, "output") ?? "atlas-vision.toml",
    );

    await writeFile(outputPath, DEFAULT_CONFIG_TOML, "utf-8");
    console.log(`Created: ${outputPath}`);
    console.log("");
    console.log("Edit the file to set your API key and preferences.");
    console.log("Env vars still override any config file value.");
    return 0;
  }

  // ── config (default: show current) ──────────────────────────
  if (!subcommand || subcommand === "show") {
    // Load sync to detect config file
    const configPath = getActiveConfigPath();
    const configFile = loadConfigFileSync();

    // Load full resolved config (env + config file merge)
    const config = loadConfig();

    if (hasFlag(flags, "json")) {
      const resolved = {
        configFile: configPath ? { path: configPath, sections: configFile ?? null } : null,
        resolved: {
          provider: {
            provider: config.vision.provider,
            baseUrl: config.vision.baseUrl,
            model: config.vision.model,
            temperature: config.vision.temperature,
            timeoutMs: config.vision.timeoutMs,
            maxImageMb: config.vision.maxImageMb,
            maxOutputTokens: config.vision.maxOutputTokens,
            retryMax: config.vision.retryMax,
          },
          cache: {
            disableCache: config.cache.disableCache,
            ttlHours: config.cache.ttlHours,
            maxEntries: config.cache.maxEntries,
            maxSizeMb: config.cache.maxSizeMb,
          },
          atlas: {
            allowedDirs: config.atlas.allowedDirs,
            storeHistory: config.atlas.storeHistory,
            logLevel: config.atlas.logLevel,
            logImageContent: config.atlas.logImageContent,
            redactSecrets: config.atlas.redactSecrets,
            checkPii: config.atlas.checkPii,
            defaultDetailLevel: config.atlas.defaultDetailLevel,
            adaptiveDetail: config.atlas.adaptiveDetail,
            trackCosts: config.atlas.trackCosts,
          },
        },
      };
      console.log(JSON.stringify(resolved, null, 2));
      return 0;
    }

    // Human-readable output
    console.log("=== Atlas Vision Config ===");
    console.log("");

    // Config file
    if (configPath && configFile) {
      console.log(`Config file: ${configPath}`);
      const sections = [];
      if (configFile.provider) sections.push("provider");
      if (configFile.cache) sections.push("cache");
      if (configFile.atlas) sections.push("atlas");
      console.log(`Sections set: ${sections.join(", ") || "(file is empty)"}`);
    } else {
      console.log("Config file: (none) — all values from env vars + defaults");
    }
    console.log("");

    // Provider
    console.log("── Provider ──────────────────────────────────────");
    console.log(`  provider:   ${config.vision.provider}`);
    console.log(`  base_url:   ${config.vision.baseUrl}`);
    console.log(`  model:      ${config.vision.model}`);
    console.log(`  api_key:    ${maskSecret(config.vision.apiKey)}`);
    console.log(`  temperature: ${config.vision.temperature}`);
    console.log(`  timeout_ms: ${config.vision.timeoutMs}`);
    console.log(`  max_image_mb: ${config.vision.maxImageMb}`);
    console.log(`  max_output_tokens: ${config.vision.maxOutputTokens}`);
    console.log(`  retry_max:  ${config.vision.retryMax}`);
    console.log("");

    // Cache
    console.log("── Cache ─────────────────────────────────────────");
    console.log(`  disable:    ${config.cache.disableCache}`);
    console.log(`  ttl_hours:  ${config.cache.ttlHours}`);
    console.log(`  max_entries: ${config.cache.maxEntries}`);
    console.log(`  max_size_mb: ${config.cache.maxSizeMb}`);
    console.log("");

    // Atlas
    console.log("── Atlas ─────────────────────────────────────────");
    console.log(`  allowed_dirs:     ${config.atlas.allowedDirs.join(", ")}`);
    console.log(`  log_level:        ${config.atlas.logLevel}`);
    console.log(`  store_history:    ${config.atlas.storeHistory}`);
    console.log(`  log_image_content: ${config.atlas.logImageContent}`);
    console.log(`  redact_secrets:   ${config.atlas.redactSecrets}`);
    console.log(`  check_pii:        ${config.atlas.checkPii}`);
    console.log(`  adaptive_detail:  ${config.atlas.adaptiveDetail}`);
    console.log(`  default_detail:   ${config.atlas.defaultDetailLevel}`);
    console.log(`  track_costs:      ${config.atlas.trackCosts}`);
    console.log("");

    if (!configPath) {
      console.log("Tip: Create a config file with: atlas-vision config init");
    }

    return 0;
  }

  console.error("Usage: atlas-vision config [show|path|init] [--json] [--output <file>]");
  console.error("");
  console.error("  config        Show current resolved configuration");
  console.error("  config path   Show config file path (or 'No config file found')");
  console.error("  config init   Create default atlas-vision.toml in current directory");
  console.error("");
  console.error("  --json        Output as JSON (with config show)");
  console.error("  --output      Output path for config init (default: ./atlas-vision.toml)");
  return 1;
}
