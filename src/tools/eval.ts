import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AtlasConfig } from "../config.js";
import type { VisionProvider } from "../providers/types.js";
import { analyzeImage } from "./analyze-image.js";
import { ocrImage } from "./ocr-image.js";

/**
 * Minimum fraction of expected text items that must match for a fixture to pass.
 * Default 0.5 (50%). Pass --threshold 0.8 to require 80%.
 */
const DEFAULT_MATCH_THRESHOLD = 0.5;

export interface GoldenFixture {
  id: string;
  file: string;
  type: string;
  expected_text: string[];
  expected_elements: string[];
}

export interface GoldenManifest {
  fixtures: GoldenFixture[];
  description?: string;
}

export interface EvalResult {
  fixture_id: string;
  mode: "analyze" | "ocr";
  passed: boolean;
  details: {
    summary?: string;
    observations_count?: number;
    text_blocks_count?: number;
    /** Expected text that was found in the output */
    matches_expected_text: string[];
    /** Expected text that was NOT found */
    missing_expected_text: string[];
    /** Match rate: matches / (matches + missing) */
    text_match_rate?: number;
    /** Expected elements that were found */
    matches_expected_elements: string[];
    /** Expected elements that were NOT found */
    missing_expected_elements: string[];
    errors?: string[];
  };
}

export interface EvalReport {
  timestamp: string;
  provider: string;
  model: string;
  threshold: number;
  total: number;
  passed: number;
  failed: number;
  /** Fraction of found text across all fixtures */
  overall_text_match_rate: number;
  results: EvalResult[];
}

function loadManifest(goldenDir: string): GoldenManifest {
  const path = resolve(goldenDir, "manifest.json");
  return JSON.parse(readFileSync(path, "utf8")) as GoldenManifest;
}

/**
 * Compute text match rate and missing entries between expected and actual text.
 */
function matchText(
  expectedText: string[],
  allActualText: string,
): {
  matches: string[];
  missing: string[];
  rate: number;
} {
  const lowerActual = allActualText.toLowerCase();
  const matches = expectedText.filter((t) => lowerActual.includes(t.toLowerCase()));
  const missing = expectedText.filter((t) => !lowerActual.includes(t.toLowerCase()));
  const total = matches.length + missing.length;
  const rate = total > 0 ? matches.length / total : 1;
  return { matches, missing, rate };
}

export interface EvalOptions {
  /**
   * Minimum text match rate (0–1) for a fixture to pass.
   * Default: 0.5 (50% of expected text must be found).
   */
  threshold?: number;
}

export async function runEval(
  goldenDir: string,
  config: AtlasConfig,
  provider: VisionProvider,
  options: EvalOptions = {},
): Promise<EvalReport> {
  const manifest = loadManifest(goldenDir);
  const results: EvalResult[] = [];
  const threshold = options.threshold ?? DEFAULT_MATCH_THRESHOLD;
  let totalMatches = 0;
  let totalExpected = 0;

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
          text_match_rate: 0,
          matches_expected_elements: [],
          missing_expected_elements: fixture.expected_elements,
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
              : fixture.type === "dashboard" ||
                  fixture.type === "ui_dark" ||
                  fixture.type === "ui_components"
                ? "general"
                : fixture.type === "document"
                  ? "document"
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
      const allText = [analyzeResult.structured.summary, ...obsText].join(" ");

      const textResult = matchText(fixture.expected_text, allText);
      const elemResult = matchText(fixture.expected_elements, allText);

      const fixturePassed =
        analyzeResult.structured.observations.length > 0 && textResult.rate >= threshold;

      totalMatches += textResult.matches.length;
      totalExpected += textResult.matches.length + textResult.missing.length;

      results.push({
        fixture_id: fixture.id,
        mode: "analyze",
        passed: fixturePassed,
        details: {
          summary: analyzeResult.structured.summary,
          observations_count: analyzeResult.structured.observations.length,
          matches_expected_text: textResult.matches,
          missing_expected_text: textResult.missing,
          text_match_rate: textResult.rate,
          matches_expected_elements: elemResult.matches,
          missing_expected_elements: elemResult.missing,
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
          text_match_rate: 0,
          matches_expected_elements: [],
          missing_expected_elements: fixture.expected_elements,
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

      const ocrText = ocrResult.structured.visible_text.map((t) => t.text).join(" ");

      const textResult = matchText(fixture.expected_text, ocrText);

      totalMatches += textResult.matches.length;
      totalExpected += textResult.matches.length + textResult.missing.length;

      results.push({
        fixture_id: fixture.id,
        mode: "ocr",
        passed: ocrResult.structured.visible_text.length > 0 && textResult.rate >= threshold,
        details: {
          text_blocks_count: ocrResult.structured.visible_text.length,
          matches_expected_text: textResult.matches,
          missing_expected_text: textResult.missing,
          text_match_rate: textResult.rate,
          matches_expected_elements: [],
          missing_expected_elements: [],
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
          text_match_rate: 0,
          matches_expected_elements: [],
          missing_expected_elements: [],
          errors: [(err as Error).message],
        },
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const overallTextMatchRate = totalExpected > 0 ? totalMatches / totalExpected : 1;

  return {
    timestamp: new Date().toISOString(),
    provider: provider.name,
    model: (provider as unknown as Record<string, string>).model ?? "unknown",
    threshold,
    total: results.length,
    passed,
    failed: results.length - passed,
    overall_text_match_rate: overallTextMatchRate,
    results,
  };
}

export function renderEvalReport(report: EvalReport): string {
  const pct = (report.overall_text_match_rate * 100).toFixed(1);
  const lines: string[] = [
    "# Eval Report",
    "",
    `**Provider:** ${report.provider} · **Model:** ${report.model}`,
    `**Threshold:** ${(report.threshold * 100).toFixed(0)}%`,
    `**Timestamp:** ${report.timestamp}`,
    `**Results:** ${report.passed}/${report.total} passed (${report.failed} failed)`,
    `**Overall text match rate:** ${pct}%`,
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
    if (result.details.text_match_rate !== undefined) {
      lines.push(`**Text match rate:** ${(result.details.text_match_rate * 100).toFixed(0)}%`);
    }
    if (result.details.matches_expected_text.length > 0) {
      lines.push(`  ✓ ${result.details.matches_expected_text.join(", ")}`);
    }
    if (result.details.missing_expected_text.length > 0) {
      lines.push(`  ✗ missing: ${result.details.missing_expected_text.join(", ")}`);
    }
    if (result.details.matches_expected_elements.length > 0) {
      lines.push(`  ✓ elements: ${result.details.matches_expected_elements.join(", ")}`);
    }
    if (result.details.missing_expected_elements.length > 0) {
      lines.push(`  ✗ missing elements: ${result.details.missing_expected_elements.join(", ")}`);
    }
    if (result.details.errors?.length) {
      lines.push(`  ⚠️ ${result.details.errors.join("; ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
