import { writeFile } from "node:fs/promises";
import { ConfigError, loadConfig, validateProviderConfig, type AtlasConfig } from "../config.js";
import { ImageError } from "../image/errors.js";
import { PathPolicyError } from "../security/path-policy.js";
import { createVisionProvider } from "../providers/router.js";
import { ProviderError } from "../providers/errors.js";
import type { FetchFn, VisionProvider } from "../providers/types.js";
import { analyzeImage } from "../tools/analyze-image.js";
import { analyzeUiScreenshot } from "../tools/analyze-ui-screenshot.js";
import { compareImages } from "../tools/compare-images.js";
import { ocrImage } from "../tools/ocr-image.js";
import {
  analyzeImageModeSchema,
  compareImagesFocusSchema,
  compareImagesSeverityThresholdSchema,
  uiScreenshotGoalSchema,
  uiStyleSystemSchema,
  uiTargetFrameworkSchema,
} from "../extraction/schemas.js";
import type { AnalyzeImageMode } from "../extraction/schemas.js";
import { serveStdio } from "../server.js";
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

      if (hasFlag(flags, "json")) {
        const json = `${JSON.stringify(result.structured, null, 2)}\n`;
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
        log.log(renderUiScreenshotCliText(result.markdown));
      }

      if (!hasFlag(flags, "json") && hasFlag(flags, "save")) {
        const savePath = getFlagString(flags, "save");
        if (!savePath) {
          log.error("--save requires a file path");
          return 1;
        }
        await writeOutput(savePath, `${JSON.stringify(result.structured, null, 2)}\n`, "utf8");
      }

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

    if (hasFlag(flags, "json")) {
      const json = `${JSON.stringify(result.structured, null, 2)}\n`;
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
      log.log(renderAnalyzeCliText(result.markdown));
    }

    if (!hasFlag(flags, "json") && hasFlag(flags, "save")) {
      const savePath = getFlagString(flags, "save");
      if (!savePath) {
        log.error("--save requires a file path");
        return 1;
      }
      await writeOutput(savePath, `${JSON.stringify(result.structured, null, 2)}\n`, "utf8");
    }

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

export async function runDoctorCommand(
  dependencies: DoctorCommandDependencies = {},
): Promise<number> {
  const log = dependencies.log ?? console;
  const load = dependencies.loadConfig ?? loadConfig;
  const createProvider = dependencies.createProvider ?? createVisionProvider;
  const checkSharp = dependencies.checkSharp ?? defaultSharpCheck;

  let exitCode = 0;
  const lines: string[] = ["Atlas Vision doctor", ""];

  const nodeVersion = process.versions.node;
  const nodeMajor = Number(nodeVersion.split(".")[0] ?? 0);
  lines.push(`Node.js: ${nodeVersion}${nodeMajor >= 20 ? " (ok)" : " (requires >= 20)"}`);
  if (nodeMajor < 20) {
    exitCode = 1;
  }

  try {
    const config = load();
    lines.push(`Vision provider: ${config.vision.provider}`);
    lines.push(`Vision base URL: ${config.vision.baseUrl}`);
    lines.push(`Vision model: ${config.vision.model}`);
    lines.push(`Vision API key: ${maskSecret(config.vision.apiKey)}`);
    lines.push(`Allowed dirs: ${config.atlas.allowedDirs.join(", ")}`);
    lines.push(`Max image size: ${config.vision.maxImageMb} MB`);

    const sharpOk = await checkSharp();
    lines.push(`Image processing (sharp): ${sharpOk ? "ok" : "missing"}`);
    if (!sharpOk) {
      exitCode = 1;
    }

    try {
      validateProviderConfig(config);
      const provider: VisionProvider = createProvider(config, { fetch: dependencies.fetch });
      const health = await provider.healthCheck();
      lines.push(`Provider health: ${health.ok ? "ok" : "failed"}`);
      if (health.message) {
        lines.push(`Provider message: ${health.message}`);
      }
      if (!health.ok) {
        exitCode = 1;
      }
    } catch (error) {
      lines.push(`Provider health: skipped (${formatCliFailure(error)})`);
      exitCode = 1;
    }
  } catch (error) {
    lines.push(`Configuration: failed (${formatCliFailure(error)})`);
    exitCode = 1;
  }

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
    const preserveLayout = hasFlag(flags, "no-preserve-layout")
      ? false
      : true;
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

    if (hasFlag(flags, "json")) {
      const json = `${JSON.stringify(result.structured, null, 2)}\n`;
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
      log.log(renderOcrCliText(result.markdown));
    }

    if (!hasFlag(flags, "json") && hasFlag(flags, "save")) {
      const savePath = getFlagString(flags, "save");
      if (!savePath) {
        log.error("--save requires a file path");
        return 1;
      }
      await writeOutput(savePath, `${JSON.stringify(result.structured, null, 2)}\n`, "utf8");
    }

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

    if (hasFlag(flags, "json")) {
      const json = `${JSON.stringify(result.structured, null, 2)}\n`;
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
      log.log(renderCompareCliText(result.markdown));
    }

    if (!hasFlag(flags, "json") && hasFlag(flags, "save")) {
      const savePath = getFlagString(flags, "save");
      if (!savePath) {
        log.error("--save requires a file path");
        return 1;
      }
      await writeOutput(savePath, `${JSON.stringify(result.structured, null, 2)}\n`, "utf8");
    }

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
