import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AtlasConfig } from "../config.js";
import type { VisionProvider } from "../providers/types.js";
import { analyzeImage } from "./analyze-image.js";
import { ocrImage } from "./ocr-image.js";

export interface GoldenFixture {
  id: string;
  file: string;
  type: string;
  expected_text: string[];
  expected_elements: string[];
}

export interface GoldenManifest {
  fixtures: GoldenFixture[];
}

export interface EvalResult {
  fixture_id: string;
  mode: "analyze" | "ocr";
  passed: boolean;
  details: {
    summary?: string;
    observations_count?: number;
    text_blocks_count?: number;
    matches_expected_text: string[];
    missing_expected_text: string[];
    errors?: string[];
  };
}

export interface EvalReport {
  timestamp: string;
  provider: string;
  model: string;
  total: number;
  passed: number;
  failed: number;
  results: EvalResult[];
}

function loadManifest(goldenDir: string): GoldenManifest {
  const path = resolve(goldenDir, "manifest.json");
  return JSON.parse(readFileSync(path, "utf8")) as GoldenManifest;
}

export async function runEval(
  goldenDir: string,
  config: AtlasConfig,
  provider: VisionProvider,
): Promise<EvalReport> {
  const manifest = loadManifest(goldenDir);
  const results: EvalResult[] = [];

  for (const fixture of manifest.fixtures) {
    const imagePath = resolve(goldenDir, fixture.file);
    if (!existsSync(imagePath)) {
      results.push({
        fixture_id: fixture.id,
        mode: "analyze",
        passed: false,
        details: {
          matches_expected_text: [],
          missing_expected_text: fixture.expected_text,
          errors: [`Image file not found: ${fixture.file}`],
        },
      });
      continue;
    }

    // --- analyze_image ---
    try {
      const analyzeMode =
        fixture.type === "diagram"
          ? "diagram"
          : fixture.type === "chart"
            ? "chart"
            : fixture.type === "error_screenshot" || fixture.type === "form"
              ? "error_screenshot"
              : fixture.type === "dashboard" || fixture.type === "ui_dark"
                ? "general"
                : "general";

      const analyzeResult = await analyzeImage(
        {
          image_path: imagePath,
          mode: analyzeMode,
          detail_level: "standard",
        },
        { config, cwd: process.cwd() },
      );

      const obsText = analyzeResult.structured.observations.map((o) => o.content);
      const allText = [analyzeResult.structured.summary, ...obsText].join(" ").toLowerCase();

      const matchesExpected = fixture.expected_text.filter((t) =>
        allText.includes(t.toLowerCase()),
      );

      results.push({
        fixture_id: fixture.id,
        mode: "analyze",
        passed: analyzeResult.structured.observations.length > 0,
        details: {
          summary: analyzeResult.structured.summary,
          observations_count: analyzeResult.structured.observations.length,
          matches_expected_text: matchesExpected,
          missing_expected_text: [],
        },
      });
    } catch (err) {
      results.push({
        fixture_id: fixture.id,
        mode: "analyze",
        passed: false,
        details: {
          matches_expected_text: [],
          missing_expected_text: fixture.expected_text,
          errors: [(err as Error).message],
        },
      });
    }

    // --- ocr_image ---
    try {
      const ocrResult = await ocrImage(
        {
          image_path: imagePath,
          preserve_layout: false,
          extract_tables: false,
          extract_code: false,
        },
        { config, cwd: process.cwd() },
      );

      const ocrText = ocrResult.structured.visible_text
        .map((t) => t.text)
        .join(" ")
        .toLowerCase();

      const matchesOcr = fixture.expected_text.filter((t) => ocrText.includes(t.toLowerCase()));

      results.push({
        fixture_id: fixture.id,
        mode: "ocr",
        passed: ocrResult.structured.visible_text.length > 0,
        details: {
          text_blocks_count: ocrResult.structured.visible_text.length,
          matches_expected_text: matchesOcr,
          missing_expected_text: [],
        },
      });
    } catch (err) {
      results.push({
        fixture_id: fixture.id,
        mode: "ocr",
        passed: false,
        details: {
          matches_expected_text: [],
          missing_expected_text: fixture.expected_text,
          errors: [(err as Error).message],
        },
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  return {
    timestamp: new Date().toISOString(),
    provider: provider.name,
    model: (provider as unknown as Record<string, string>).model ?? "unknown",
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}

export function renderEvalReport(report: EvalReport): string {
  const lines: string[] = [
    "# Eval Report",
    "",
    `**Provider:** ${report.provider} · **Model:** ${report.model}`,
    `**Timestamp:** ${report.timestamp}`,
    `**Results:** ${report.passed}/${report.total} passed (${report.failed} failed)`,
    "",
  ];

  for (const result of report.results) {
    const icon = result.passed ? "✅" : "❌";
    lines.push(`### ${icon} ${result.fixture_id} [${result.mode}]`);
    if (result.details.summary) {
      lines.push(`**Summary:** ${result.details.summary}`);
    }
    if (result.details.observations_count !== undefined) {
      lines.push(`**Observations:** ${result.details.observations_count}`);
    }
    if (result.details.text_blocks_count !== undefined) {
      lines.push(`**Text blocks:** ${result.details.text_blocks_count}`);
    }
    if (result.details.matches_expected_text.length > 0) {
      const matched = result.details.matches_expected_text.length;
      const total = matched + result.details.missing_expected_text.length;
      lines.push(`**Matched expected text:** ${matched}/${total}`);
      lines.push(`  ${result.details.matches_expected_text.join(", ")}`);
    }
    if (result.details.errors?.length) {
      lines.push(`**⚠️ Errors:** ${result.details.errors.join("; ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
