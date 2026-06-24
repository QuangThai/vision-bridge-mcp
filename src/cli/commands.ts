import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  type ModelCapabilities,
  type ModelsDevClientOptions,
  getModelCapabilities,
  parseModelRef,
} from "../capabilities/index.js";
import { type AtlasConfig, ConfigError, loadConfig, validateProviderConfig } from "../config.js";
import {
  type AnalyzeImageMode,
  analyzeImageModeSchema,
  compareImagesFocusSchema,
  compareImagesSeverityThresholdSchema,
  uiScreenshotGoalSchema,
  uiStyleSystemSchema,
  uiTargetFrameworkSchema,
} from "../extraction/schemas.js";
import { ImageError } from "../image/errors.js";
import { ProviderError } from "../providers/errors.js";
import { createVisionProvider } from "../providers/router.js";
import type { FetchFn, VisionProvider } from "../providers/types.js";
import { PathPolicyError } from "../security/path-policy.js";
import { serveStdio } from "../server.js";
import { analyzeImage } from "../tools/analyze-image.js";
import { analyzeUiScreenshot } from "../tools/analyze-ui-screenshot.js";
import { compareImages } from "../tools/compare-images.js";
import { renderEvalReport, runEval } from "../tools/eval.js";
import { ocrImage } from "../tools/ocr-image.js";
import { getFlagString, hasFlag, parseArgs } from "./parse-args.js";

function resolveCliMode(value: string | undefined): AnalyzeImageMode {
  const mode = value ?? "general";
  if (mode === "ui") {
    return "general";
  }
  return analyzeImageModeSchema.parse(mode);
}

function resolveUiFramework(value: string | undefined) {
  return uiTargetFrameworkSchema.parse(value ?? "unknown");
}

function resolveUiStyleSystem(value: string | undefined) {
  return uiStyleSystemSchema.parse(value ?? "unknown");
}

function resolveUiGoal(value: string | undefined) {
  return uiScreenshotGoalSchema.parse(value ?? "describe");
}

function resolveCompareFocus(value: string | undefined) {
  return compareImagesFocusSchema.parse(value ?? "general");
}

function resolveCompareSeverityThreshold(value: string | undefined) {
  return compareImagesSeverityThresholdSchema.parse(value ?? "low");
}

function resolveDetailLevel(
  value: string | undefined,
  config: AtlasConfig,
): "brief" | "standard" | "detailed" {
  const detail = value ?? config.atlas.defaultDetailLevel;
  if (detail === "brief" || detail === "standard" || detail === "detailed") {
    return detail;
  }
  throw new ConfigError(`Invalid --detail value: ${detail}`);
}

interface CliOutputOptions {
  flags: Map<string, string | true>;
  log: Pick<Console, "log" | "error">;
  writeOutput: typeof writeFile;
  markdown: string;
  structured: unknown;
  renderMarkdown: (markdown: string) => string;
}

async function handleCliOutput(options: CliOutputOptions): Promise<number | undefined> {
  const { flags, log, writeOutput, markdown, structured, renderMarkdown } = options;

  if (hasFlag(flags, "json")) {
    const json = `${JSON.stringify(structured, null, 2)}\n`;
    if (hasFlag(flags, "save")) {
      const savePath = getFlagString(flags, "save");
      if (!savePath) {
        log.error("--save requires a file path when used with --json");
        return 1;
      }
      await writeOutput(savePath, json, "utf8");
    } else {
      log.log(json.trimEnd());
    }
  } else {
    log.log(renderMarkdown(markdown));
  }

  if (!hasFlag(flags, "json") && hasFlag(flags, "save")) {
    const savePath = getFlagString(flags, "save");
    if (!savePath) {
      log.error("--save requires a file path");
      return 1;
    }
    await writeOutput(savePath, `${JSON.stringify(structured, null, 2)}\n`, "utf8");
  }

  return undefined;
}

export function formatCliFailure(error: unknown): string {
  if (
    error instanceof ConfigError ||
    error instanceof ImageError ||
    error instanceof PathPolicyError ||
    error instanceof ProviderError
  ) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}

export function renderAnalyzeCliText(markdown: string): string {
  return markdown
    .replace(/^## Summary\n?/m, "Summary:\n")
    .replace(/^## Verified observations\n?/m, "\nVerified evidence:\n")
    .replace(/^## Inferences\n?/m, "\nInferred:\n")
    .replace(/^## Uncertainties\n?/m, "\nUncertain:\n")
    .replace(/^## Recommended next steps\n?/m, "\nRecommended next steps:\n")
    .replace(/^## Security notes\n?/m, "\nSecurity notes:\n")
    .replace(/^- \[(.+?)\] /gm, "- ")
    .replace(/ \(confidence: [0-9.]+\)/g, "");
}

export function renderUiScreenshotCliText(markdown: string): string {
  return markdown
    .replace(/^## Summary\n?/m, "Summary:\n")
    .replace(/^Screen type: /m, "Screen type: ")
    .replace(/^## UI elements\n?/m, "\nUI elements:\n")
    .replace(/^## Layout\n?/m, "\nLayout:\n")
    .replace(/^## Accessibility issues\n?/m, "\nAccessibility issues:\n")
    .replace(/^## Implementation plan\n?/m, "\nImplementation plan:\n")
    .replace(/^## Uncertainties\n?/m, "\nUncertainties:\n")
    .replace(/^- \[(.+?)\] /gm, "- ")
    .replace(/ \(confidence: [0-9.]+\)/g, "");
}

export interface AnalyzeCommandDependencies {
  loadConfig?: typeof loadConfig;
  analyze?: typeof analyzeImage;
  analyzeUiScreenshot?: typeof analyzeUiScreenshot;
  writeOutput?: typeof writeFile;
  log?: Pick<Console, "log" | "error">;
  cwd?: string;
  fetch?: FetchFn;
}

export async function runAnalyzeCommand(
  argv: string[],
  dependencies: AnalyzeCommandDependencies = {},
): Promise<number> {
  const log = dependencies.log ?? console;
  const writeOutput = dependencies.writeOutput ?? writeFile;
  const load = dependencies.loadConfig ?? loadConfig;
  const analyze = dependencies.analyze ?? analyzeImage;
  const analyzeUi = dependencies.analyzeUiScreenshot ?? analyzeUiScreenshot;

  const { positional, flags } = parseArgs(argv);
  const imagePath = positional[0];
  if (!imagePath) {
    log.error(
      "Usage: atlas-vision analyze <image_path> [--mode <mode>] [--detail <level>] [--framework <name>] [--style-system <name>] [--goal <goal>] [--json] [--save <file>]",
    );
    return 1;
  }

  try {
    const config = load();
    const rawMode = getFlagString(flags, "mode");

    if (rawMode === "ui") {
      const result = await analyzeUi(
        {
          image_path: imagePath,
          target_framework: resolveUiFramework(getFlagString(flags, "framework")),
          style_system: resolveUiStyleSystem(getFlagString(flags, "style-system")),
          goal: resolveUiGoal(getFlagString(flags, "goal")),
        },
        {
          config,
          cwd: dependencies.cwd,
          fetch: dependencies.fetch,
        },
      );

      const outputCode = await handleCliOutput({
        flags,
        log,
        writeOutput,
        markdown: result.markdown,
        structured: result.structured,
        renderMarkdown: renderUiScreenshotCliText,
      });
      if (outputCode !== undefined) return outputCode;

      return 0;
    }

    const mode = resolveCliMode(rawMode);
    const detailLevel = resolveDetailLevel(getFlagString(flags, "detail"), config);

    const result = await analyze(
      {
        image_path: imagePath,
        mode,
        detail_level: detailLevel,
      },
      {
        config,
        cwd: dependencies.cwd,
        fetch: dependencies.fetch,
      },
    );

    const outputCode = await handleCliOutput({
      flags,
      log,
      writeOutput,
      markdown: result.markdown,
      structured: result.structured,
      renderMarkdown: renderAnalyzeCliText,
    });
    if (outputCode !== undefined) return outputCode;

    return 0;
  } catch (error) {
    log.error(formatCliFailure(error));
    return 1;
  }
}

export interface DoctorCommandDependencies {
  loadConfig?: typeof loadConfig;
  createProvider?: typeof createVisionProvider;
  checkSharp?: () => Promise<boolean>;
  log?: Pick<Console, "log" | "error">;
  fetch?: FetchFn;
  env?: NodeJS.ProcessEnv;
  getModelCapabilities?: typeof getModelCapabilities;
}

async function defaultSharpCheck(): Promise<boolean> {
  try {
    await import("sharp");
    return true;
  } catch {
    return false;
  }
}

function maskSecret(value: string): string {
  if (!value) {
    return "(missing)";
  }
  if (value.length <= 8) {
    return "(set)";
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function formatMainModelCapabilityLines(
  capabilities: ModelCapabilities,
  recommendation: string,
): string[] {
  return [
    `Main model: ${capabilities.providerId}/${capabilities.modelId}`,
    `Main model vision: ${capabilities.supportsVision ? "yes" : "no"} (${capabilities.source})`,
    `Main model modalities: ${capabilities.inputModalities.join(", ") || "(unknown)"}`,
    `Atlas bridge: ${recommendation}`,
  ];
}

async function appendMainModelCapabilityLines(
  lines: string[],
  env: NodeJS.ProcessEnv,
  lookupCapabilities: typeof getModelCapabilities,
  fetch?: FetchFn,
): Promise<void> {
  const mainModelRef = env.MAIN_MODEL_REF?.trim();
  if (!mainModelRef) {
    return;
  }

  lines.push("");
  try {
    const lookup = parseModelRef(mainModelRef, env.MAIN_MODEL_PROVIDER?.trim());
    const modelsDevOptions: ModelsDevClientOptions = fetch ? { fetch } : {};
    const capabilities = await lookupCapabilities(lookup, modelsDevOptions);
    const recommendation = capabilities.supportsVision
      ? "optional — main model can read images natively"
      : "recommended — auto-intercept images via Atlas MCP";
    lines.push(...formatMainModelCapabilityLines(capabilities, recommendation));
  } catch (error) {
    lines.push(`Main model: lookup failed (${formatCliFailure(error)})`);
  }
}

function checkDotenvFile(): { exists: boolean; path?: string } {
  const candidates = [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../.env")];
  for (const p of candidates) {
    if (existsSync(p)) {
      return { exists: true, path: p };
    }
  }
  return { exists: false };
}

function checkEnvVars(env: NodeJS.ProcessEnv): { key: string; present: boolean }[] {
  const vars = [
    "VISION_PROVIDER",
    "VISION_API_KEY",
    "VISION_BASE_URL",
    "VISION_MODEL",
    "ATLAS_ALLOWED_DIRS",
    "ATLAS_REDACT_SECRETS",
  ];
  return vars.map((key) => ({ key, present: !!env[key]?.trim() }));
}

function buildSuggestedFixes(
  issues: string[],
  env: NodeJS.ProcessEnv,
  config: AtlasConfig | null,
): string[] {
  const fixes: string[] = [];

  if (!env.VISION_API_KEY?.trim()) {
    fixes.push(
      "Set VISION_API_KEY in your .env file or environment. Example: VISION_API_KEY=sk-your-key",
    );
  }

  if (config && !config.vision.apiKey) {
    if (config.vision.provider === "gemini") {
      fixes.push("For Gemini: Get a free API key at https://aistudio.google.com/apikey");
    } else {
      fixes.push("For OpenAI: Get an API key at https://platform.openai.com/api-keys");
    }
  }

  if (config && config.vision.provider === "gemini") {
    const baseUrl = config.vision.baseUrl;
    if (!baseUrl || baseUrl === "https://api.openai.com/v1") {
      fixes.push(
        "For Gemini provider, set VISION_BASE_URL=https://generativelanguage.googleapis.com/v1beta",
      );
    }
  }

  if (issues.some((i) => i.includes("sharp"))) {
    fixes.push("Run: pnpm install (sharp should be installed automatically)");
  }

  return fixes;
}

export async function runDoctorCommand(
  dependencies: DoctorCommandDependencies = {},
): Promise<number> {
  const log = dependencies.log ?? console;
  const load = dependencies.loadConfig ?? loadConfig;
  const createProvider = dependencies.createProvider ?? createVisionProvider;
  const checkSharp = dependencies.checkSharp ?? defaultSharpCheck;
  const env = dependencies.env ?? process.env;
  const lookupCapabilities = dependencies.getModelCapabilities ?? getModelCapabilities;

  let exitCode = 0;
  const issues: string[] = [];
  const suggestions: string[] = [];
  const lines: string[] = ["Atlas Vision doctor", ""];

  // ── Node.js ────────────────────────────────────────────────
  const nodeVersion = process.versions.node;
  const nodeMajor = Number(nodeVersion.split(".")[0] ?? 0);
  const nodeOk = nodeMajor >= 20;
  lines.push(`Node.js: ${nodeVersion}${nodeOk ? " (ok)" : " ✗ (requires >= 20)"}`);
  if (!nodeOk) {
    exitCode = 1;
    issues.push("Node.js >= 20 required");
    suggestions.push("Install Node.js >= 20 from https://nodejs.org");
  }

  // ── .env file ──────────────────────────────────────────────
  const dotenv = checkDotenvFile();
  if (dotenv.exists) {
    lines.push(`Config file: ${dotenv.path} (present)`);
  } else {
    lines.push("Config file: .env not found (using environment variables)");
  }

  // ── Environment variables ──────────────────────────────────
  const envChecks = checkEnvVars(env);
  for (const check of envChecks) {
    const status = check.present ? "✓" : "✗ missing";
    lines.push(`  ${check.key}: ${status}`);
    if (!check.present) {
      if (check.key === "VISION_API_KEY") {
        issues.push("Missing VISION_API_KEY");
      }
    }
  }

  // ── Configuration ──────────────────────────────────────────
  let config: AtlasConfig | null = null;
  try {
    config = load();
    lines.push("");
    lines.push(`Vision provider: ${config.vision.provider}`);
    lines.push(`Vision base URL: ${config.vision.baseUrl}`);
    lines.push(`Vision model: ${config.vision.model}`);
    lines.push(`Vision API key: ${maskSecret(config.vision.apiKey)}`);
    lines.push(`Allowed dirs: ${config.atlas.allowedDirs.join(", ")}`);
    lines.push(`Max image size: ${config.vision.maxImageMb} MB`);
    lines.push(`Redact secrets: ${config.atlas.redactSecrets}`);
    lines.push(`Log image content: ${config.atlas.logImageContent}`);

    // ── Image processing (sharp) ───────────────────────────────
    const sharpOk = await checkSharp();
    lines.push(`Image processing (sharp): ${sharpOk ? "ok" : "✗ missing"}`);
    if (!sharpOk) {
      exitCode = 1;
      issues.push("sharp library not available");
    }

    // ── Provider health ────────────────────────────────────────
    try {
      validateProviderConfig(config);
      const provider: VisionProvider = createProvider(config, { fetch: dependencies.fetch });
      const health = await provider.healthCheck();
      const healthIcon = health.ok ? "ok" : "failed";
      lines.push(`Provider health: ${healthIcon}`);
      if (health.message) {
        lines.push(`Provider message: ${health.message}`);
      }
      if (!health.ok) {
        exitCode = 1;
        issues.push(`Provider health check failed: ${health.message}`);
      }
    } catch (error) {
      lines.push(`Provider health: skipped (${formatCliFailure(error)})`);
      exitCode = 1;
      issues.push(`Provider error: ${formatCliFailure(error)}`);
    }
  } catch (error) {
    const msg = formatCliFailure(error);
    lines.push(`Configuration: ✗ ${msg}`);
    exitCode = 1;
    issues.push(msg);
  }

  // ── Suggested fixes ─────────────────────────────────────────
  const extraFixes = buildSuggestedFixes(issues, env, config);
  suggestions.push(...extraFixes);

  if (suggestions.length > 0) {
    lines.push("");
    lines.push("Suggested fixes:");
    for (const fix of suggestions) {
      lines.push(`  ${fix}`);
    }
  }

  // ── Main model capability (optional) ────────────────────────
  await appendMainModelCapabilityLines(lines, env, lookupCapabilities, dependencies.fetch);

  log.log(lines.join("\n"));
  return exitCode;
}

export function renderOcrCliText(markdown: string): string {
  return markdown
    .replace(/^## Summary\n?/m, "Summary:\n")
    .replace(/^## Extracted text\n?/m, "\nExtracted text:\n")
    .replace(/^## Layout text\n?/m, "\nLayout text:\n")
    .replace(/^## Warnings\n?/m, "\nWarnings:\n")
    .replace(/^- \[(.+?)\] /gm, "- ")
    .replace(/ \(confidence: [0-9.]+\)/g, "");
}

export interface OcrCommandDependencies {
  loadConfig?: typeof loadConfig;
  ocr?: typeof ocrImage;
  writeOutput?: typeof writeFile;
  log?: Pick<Console, "log" | "error">;
  cwd?: string;
  fetch?: FetchFn;
}

export async function runOcrCommand(
  argv: string[],
  dependencies: OcrCommandDependencies = {},
): Promise<number> {
  const log = dependencies.log ?? console;
  const writeOutput = dependencies.writeOutput ?? writeFile;
  const load = dependencies.loadConfig ?? loadConfig;
  const ocr = dependencies.ocr ?? ocrImage;

  const { positional, flags } = parseArgs(argv);
  const imagePath = positional[0];
  if (!imagePath) {
    log.error(
      "Usage: atlas-vision ocr <image_path> [--preserve-layout] [--no-preserve-layout] [--extract-tables] [--extract-code] [--json] [--save <file>]",
    );
    return 1;
  }

  try {
    const config = load();
    const preserveLayout = !hasFlag(flags, "no-preserve-layout");
    const result = await ocr(
      {
        image_path: imagePath,
        preserve_layout: preserveLayout,
        extract_tables: hasFlag(flags, "extract-tables"),
        extract_code: hasFlag(flags, "extract-code"),
      },
      {
        config,
        cwd: dependencies.cwd,
        fetch: dependencies.fetch,
      },
    );

    const outputCode = await handleCliOutput({
      flags,
      log,
      writeOutput,
      markdown: result.markdown,
      structured: result.structured,
      renderMarkdown: renderOcrCliText,
    });
    if (outputCode !== undefined) return outputCode;

    return 0;
  } catch (error) {
    log.error(formatCliFailure(error));
    return 1;
  }
}

export function renderCompareCliText(markdown: string): string {
  return markdown
    .replace(/^## Summary\n?/m, "Summary:\n")
    .replace(/^Regression likelihood: /m, "Regression likelihood: ")
    .replace(/^## Differences\n?/m, "\nDifferences:\n")
    .replace(/^## Recommended next steps\n?/m, "\nRecommended next steps:\n")
    .replace(/^- \[(.+?)\] /gm, "- ")
    .replace(/ \(severity: [a-z]+, confidence: [0-9.]+\)/g, "");
}

export interface CompareCommandDependencies {
  loadConfig?: typeof loadConfig;
  compare?: typeof compareImages;
  writeOutput?: typeof writeFile;
  log?: Pick<Console, "log" | "error">;
  cwd?: string;
  fetch?: FetchFn;
}

export async function runCompareCommand(
  argv: string[],
  dependencies: CompareCommandDependencies = {},
): Promise<number> {
  const log = dependencies.log ?? console;
  const writeOutput = dependencies.writeOutput ?? writeFile;
  const load = dependencies.loadConfig ?? loadConfig;
  const compare = dependencies.compare ?? compareImages;

  const { positional, flags } = parseArgs(argv);
  const beforePath = positional[0];
  const afterPath = positional[1];
  if (!beforePath || !afterPath) {
    log.error(
      "Usage: atlas-vision compare <before_path> <after_path> [--focus <focus>] [--severity-threshold <level>] [--json] [--save <file>]",
    );
    return 1;
  }

  try {
    const config = load();
    const result = await compare(
      {
        before_path: beforePath,
        after_path: afterPath,
        focus: resolveCompareFocus(getFlagString(flags, "focus")),
        severity_threshold: resolveCompareSeverityThreshold(
          getFlagString(flags, "severity-threshold"),
        ),
      },
      {
        config,
        cwd: dependencies.cwd,
        fetch: dependencies.fetch,
      },
    );

    const outputCode = await handleCliOutput({
      flags,
      log,
      writeOutput,
      markdown: result.markdown,
      structured: result.structured,
      renderMarkdown: renderCompareCliText,
    });
    if (outputCode !== undefined) return outputCode;

    return 0;
  } catch (error) {
    log.error(formatCliFailure(error));
    return 1;
  }
}

export interface ServeCommandDependencies {
  serveStdio?: typeof serveStdio;
  log?: Pick<Console, "log" | "error">;
}

export async function runServeCommand(
  argv: string[],
  dependencies: ServeCommandDependencies = {},
): Promise<number> {
  const log = dependencies.log ?? console;
  const serve = dependencies.serveStdio ?? serveStdio;
  const { flags } = parseArgs(argv);
  const transport = getFlagString(flags, "transport") ?? "stdio";

  if (transport !== "stdio") {
    log.error(`Unsupported transport: ${transport}. Only stdio is supported in MVP.`);
    return 1;
  }

  try {
    await serve();
    return 0;
  } catch (error) {
    log.error(formatCliFailure(error));
    return 1;
  }
}

export interface EvalCommandDependencies {
  loadConfig?: typeof loadConfig;
  log?: typeof console;
  goldenDir?: string;
}

export async function runEvalCommand(
  _argv: string[],
  dependencies: EvalCommandDependencies = {},
): Promise<number> {
  const log = dependencies.log ?? console;
  const loadCfg = dependencies.loadConfig ?? loadConfig;

  try {
    const config = loadCfg();
    validateProviderConfig(config);
    const provider = createVisionProvider(config);
    const goldenDir = resolve(
      dependencies.goldenDir ?? resolve(import.meta.dirname, "../../tests/fixtures/golden"),
    );

    if (!existsSync(goldenDir)) {
      log.error(`Golden fixtures directory not found: ${goldenDir}`);
      return 1;
    }

    const report = await runEval(goldenDir, config, provider);
    const text = renderEvalReport(report);

    log.log(text);
    return report.failed > 0 ? 1 : 0;
  } catch (error) {
    log.error(formatCliFailure(error));
    return 1;
  }
}

export interface CapabilitiesCommandDependencies {
  log?: Pick<Console, "log" | "error">;
  fetch?: FetchFn;
  getModelCapabilities?: typeof getModelCapabilities;
}

export function renderCapabilitiesText(capabilities: ModelCapabilities): string {
  const recommendation = capabilities.supportsVision
    ? "Atlas bridge optional — main model can read images natively."
    : "Atlas bridge recommended — route images through analyze_image / ocr_image.";

  return [
    `Model: ${capabilities.providerId}/${capabilities.modelId}`,
    `Vision: ${capabilities.supportsVision ? "yes" : "no"}`,
    `Source: ${capabilities.source}`,
    `Tools: ${capabilities.supportsTools ? "yes" : "no"}`,
    `Reasoning: ${capabilities.supportsReasoning ? "yes" : "no"}`,
    `Input modalities: ${capabilities.inputModalities.join(", ") || "(unknown)"}`,
    `Output modalities: ${capabilities.outputModalities.join(", ") || "(unknown)"}`,
    `Context window: ${capabilities.contextWindow || "(unknown)"}`,
    `Max output: ${capabilities.maxOutputTokens || "(unknown)"}`,
    `Recommendation: ${recommendation}`,
  ].join("\n");
}

export async function runCapabilitiesCommand(
  argv: string[],
  dependencies: CapabilitiesCommandDependencies = {},
): Promise<number> {
  const log = dependencies.log ?? console;
  const lookupCapabilities = dependencies.getModelCapabilities ?? getModelCapabilities;
  const { positional, flags } = parseArgs(argv);
  const modelRef = positional[0] ?? getFlagString(flags, "model");

  if (!modelRef) {
    log.error("Usage: atlas-vision capabilities <provider/model> [--provider <id>] [--json]");
    return 1;
  }

  try {
    const lookup = parseModelRef(modelRef, getFlagString(flags, "provider"));
    const modelsDevOptions: ModelsDevClientOptions = dependencies.fetch
      ? { fetch: dependencies.fetch }
      : {};
    const capabilities = await lookupCapabilities(lookup, modelsDevOptions);

    if (hasFlag(flags, "json")) {
      log.log(`${JSON.stringify(capabilities, null, 2)}\n`);
      return 0;
    }

    log.log(renderCapabilitiesText(capabilities));
    return 0;
  } catch (error) {
    log.error(formatCliFailure(error));
    return 1;
  }
}
