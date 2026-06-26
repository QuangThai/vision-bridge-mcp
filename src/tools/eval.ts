import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AtlasConfig } from "../config.js";
import type { VisionProvider } from "../providers/types.js";
import { analyzeImage } from "./analyze-image.js";
import { ocrImage } from "./ocr-image.js";

/** Legacy default when neither --gate nor --threshold is set. */
export const LEGACY_MATCH_THRESHOLD = 0.5;
/** Default threshold for core-tier fixtures under --gate. */
export const CORE_GATE_THRESHOLD = 0.8;
/** Default threshold for edge-tier fixtures (informational under --gate). */
export const EDGE_DEFAULT_THRESHOLD = 0.5;
/** Default threshold for expected_elements when --gate-elements is on. */
export const CORE_ELEMENTS_GATE_THRESHOLD = 0.5;

export type GoldenTier = "core" | "edge";

export interface GoldenFixture {
  id: string;
  file: string;
  type: string;
  /** core = real screenshots (CI gate). edge = programmatic stress cases (informational). */
  tier?: GoldenTier;
  expected_text: string[];
  expected_elements: string[];
}

export interface GoldenManifest {
  fixtures: GoldenFixture[];
  description?: string;
}

export interface EvalResult {
  fixture_id: string;
  tier: GoldenTier;
  mode: "analyze" | "ocr";
  passed: boolean;
  gate_blocking: boolean;
  details: {
    summary?: string;
    observations_count?: number;
    text_blocks_count?: number;
    matches_expected_text: string[];
    missing_expected_text: string[];
    text_match_rate?: number;
    matches_expected_elements: string[];
    missing_expected_elements: string[];
    errors?: string[];
  };
}

export interface FixtureEvalSummary {
  fixture_id: string;
  tier: GoldenTier;
  passed: boolean;
  best_text_match_rate: number;
  element_match_rate: number;
  gate_blocking: boolean;
  analyze_passed: boolean;
  ocr_passed: boolean;
}

export interface EvalReport {
  timestamp: string;
  provider: string;
  model: string;
  gate: boolean;
  threshold: number;
  edge_threshold: number;
  total: number;
  passed: number;
  failed: number;
  overall_text_match_rate: number;
  core_passed: number;
  core_failed: number;
  edge_passed: number;
  edge_failed: number;
  /** Core fixture failures that should fail CI when gate mode is on. */
  gate_failed: number;
  fixture_summaries: FixtureEvalSummary[];
  results: EvalResult[];
}

export interface EvalOptions {
  /** Match threshold for core fixtures, or global when gate is off. */
  threshold?: number;
  /** Match threshold for edge fixtures when gate is on. */
  edgeThreshold?: number;
  /** When true, only core-tier fixture failures fail the run. */
  gate?: boolean;
  /** When true with gate, core fixtures must also pass expected_elements threshold. */
  gateElements?: boolean;
  /** Match threshold for expected_elements when gateElements is on. */
  elementsThreshold?: number;
  /** Restrict which tiers to run. Default: both. */
  tiers?: GoldenTier[];
  modelName?: string;
}

function loadManifest(goldenDir: string): GoldenManifest {
  const path = resolve(goldenDir, "manifest.json");
  return JSON.parse(readFileSync(path, "utf8")) as GoldenManifest;
}

export function fixtureTier(fixture: GoldenFixture): GoldenTier {
  return fixture.tier ?? "core";
}

export function thresholdForFixture(fixture: GoldenFixture, options: EvalOptions): number {
  const tier = fixtureTier(fixture);
  if (options.gate) {
    if (tier === "edge") {
      return options.edgeThreshold ?? EDGE_DEFAULT_THRESHOLD;
    }
    return options.threshold ?? CORE_GATE_THRESHOLD;
  }
  return options.threshold ?? LEGACY_MATCH_THRESHOLD;
}

/**
 * Compute text match rate and missing entries between expected and actual text.
 */
export function matchText(
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

export function overallTextMatchRate(
  fixtures: GoldenFixture[],
  summaries: FixtureEvalSummary[],
): number {
  const idsWithExpected = new Set(
    fixtures.filter((fixture) => fixture.expected_text.length > 0).map((fixture) => fixture.id),
  );
  const relevant = summaries.filter((summary) => idsWithExpected.has(summary.fixture_id));
  if (relevant.length === 0) {
    return 1;
  }
  return relevant.reduce((sum, summary) => sum + summary.best_text_match_rate, 0) / relevant.length;
}

function summarizeFixtures(
  fixtures: GoldenFixture[],
  results: EvalResult[],
  options: EvalOptions,
): FixtureEvalSummary[] {
  const elementsThreshold = options.elementsThreshold ?? CORE_ELEMENTS_GATE_THRESHOLD;

  return fixtures.map((fixture) => {
    const tier = fixtureTier(fixture);
    const threshold = thresholdForFixture(fixture, options);
    const fixtureResults = results.filter((result) => result.fixture_id === fixture.id);
    const analyze = fixtureResults.find((result) => result.mode === "analyze");
    const ocr = fixtureResults.find((result) => result.mode === "ocr");
    const bestRate = Math.max(
      analyze?.details.text_match_rate ?? 0,
      ocr?.details.text_match_rate ?? 0,
    );

    const elemMatches = analyze?.details.matches_expected_elements ?? [];
    const elemMissing = analyze?.details.missing_expected_elements ?? [];
    const elemTotal = elemMatches.length + elemMissing.length;
    const elementMatchRate = elemTotal > 0 ? elemMatches.length / elemTotal : 1;

    const analyzePassed = analyze?.passed ?? false;
    const ocrPassed = ocr?.passed ?? false;
    const hasExpectedText = fixture.expected_text.length > 0;
    const hasOutput =
      (analyze?.details.observations_count ?? 0) > 0 || (ocr?.details.text_blocks_count ?? 0) > 0;

    const textPassed = hasExpectedText
      ? bestRate >= threshold && (analyzePassed || ocrPassed)
      : hasOutput;

    const elementsRequired =
      options.gate &&
      options.gateElements &&
      tier === "core" &&
      fixture.expected_elements.length > 0;
    const elementsPassed = !elementsRequired || elementMatchRate >= elementsThreshold;

    const passed = textPassed && elementsPassed;

    return {
      fixture_id: fixture.id,
      tier,
      passed,
      best_text_match_rate: bestRate,
      element_match_rate: elementMatchRate,
      gate_blocking: options.gate ? tier === "core" && !passed : !passed,
      analyze_passed: analyzePassed,
      ocr_passed: ocrPassed,
    };
  });
}

export async function runEval(
  goldenDir: string,
  config: AtlasConfig,
  provider: VisionProvider,
  options: EvalOptions = {},
): Promise<EvalReport> {
  const manifest = loadManifest(goldenDir);
  const tiersToRun = new Set(options.tiers ?? ["core", "edge"]);
  const fixtures = manifest.fixtures.filter((fixture) => tiersToRun.has(fixtureTier(fixture)));
  const gate = options.gate ?? false;
  const coreThreshold = gate
    ? (options.threshold ?? CORE_GATE_THRESHOLD)
    : (options.threshold ?? LEGACY_MATCH_THRESHOLD);
  const edgeThreshold = options.edgeThreshold ?? EDGE_DEFAULT_THRESHOLD;

  const results: EvalResult[] = [];

  for (const fixture of fixtures) {
    const tier = fixtureTier(fixture);
    const threshold = thresholdForFixture(fixture, options);
    const gateBlocking = gate ? tier === "core" : true;
    const imagePath = resolve(goldenDir, fixture.file);

    if (!existsSync(imagePath)) {
      results.push({
        fixture_id: fixture.id,
        tier,
        mode: "analyze",
        passed: false,
        gate_blocking: gateBlocking,
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

    const detailLevel = fixture.type === "document" ? "detailed" : "standard";

    try {
      const analyzeResult = await analyzeImage(
        {
          image_path: imagePath,
          mode: analyzeMode,
          detail_level: detailLevel,
        },
        { config, cwd: process.cwd(), provider },
      );

      const obsText = analyzeResult.structured.observations.map((o) => o.content);
      const allText = [analyzeResult.structured.summary, ...obsText].join(" ");
      const textResult = matchText(fixture.expected_text, allText);
      const elemResult = matchText(fixture.expected_elements, allText);
      const fixturePassed =
        analyzeResult.structured.observations.length > 0 && textResult.rate >= threshold;

      results.push({
        fixture_id: fixture.id,
        tier,
        mode: "analyze",
        passed: fixturePassed,
        gate_blocking: gateBlocking,
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
        tier,
        mode: "analyze",
        passed: false,
        gate_blocking: gateBlocking,
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

    try {
      const ocrResult = await ocrImage(
        {
          image_path: imagePath,
          preserve_layout: fixture.type === "document",
          extract_tables: fixture.type === "document",
          extract_code: false,
        },
        { config, cwd: process.cwd(), provider },
      );

      const ocrText = ocrResult.structured.visible_text.map((t) => t.text).join(" ");
      const textResult = matchText(fixture.expected_text, ocrText);

      results.push({
        fixture_id: fixture.id,
        tier,
        mode: "ocr",
        passed: ocrResult.structured.visible_text.length > 0 && textResult.rate >= threshold,
        gate_blocking: gateBlocking,
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
        tier,
        mode: "ocr",
        passed: false,
        gate_blocking: gateBlocking,
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

  const fixtureSummaries = summarizeFixtures(fixtures, results, options);
  const coreSummaries = fixtureSummaries.filter((summary) => summary.tier === "core");
  const edgeSummaries = fixtureSummaries.filter((summary) => summary.tier === "edge");
  const gateFailed = fixtureSummaries.filter((summary) => summary.gate_blocking).length;

  const passed = results.filter((result) => result.passed).length;

  return {
    timestamp: new Date().toISOString(),
    provider: provider.name,
    model: options.modelName ?? (provider as unknown as Record<string, string>).model ?? "unknown",
    gate,
    threshold: coreThreshold,
    edge_threshold: edgeThreshold,
    total: results.length,
    passed,
    failed: results.length - passed,
    overall_text_match_rate: overallTextMatchRate(fixtures, fixtureSummaries),
    core_passed: coreSummaries.filter((summary) => summary.passed).length,
    core_failed: coreSummaries.filter((summary) => !summary.passed).length,
    edge_passed: edgeSummaries.filter((summary) => summary.passed).length,
    edge_failed: edgeSummaries.filter((summary) => !summary.passed).length,
    gate_failed: gateFailed,
    fixture_summaries: fixtureSummaries,
    results,
  };
}

export function renderEvalReport(report: EvalReport): string {
  const pct = (report.overall_text_match_rate * 100).toFixed(1);
  const lines: string[] = [
    "# Eval Report",
    "",
    `**Provider:** ${report.provider} · **Model:** ${report.model}`,
    `**Gate mode:** ${report.gate ? "on (core fixtures gate CI)" : "off"}`,
    `**Core threshold:** ${(report.threshold * 100).toFixed(0)}% · **Edge threshold:** ${(report.edge_threshold * 100).toFixed(0)}%`,
    `**Timestamp:** ${report.timestamp}`,
    `**Results:** ${report.passed}/${report.total} passed (${report.failed} failed)`,
    `**Overall text match rate:** ${pct}%`,
    "",
    "## Fixture summary",
    "",
    `**Core:** ${report.core_passed}/${report.core_passed + report.core_failed} passed`,
    `**Edge (informational):** ${report.edge_passed}/${report.edge_passed + report.edge_failed} passed`,
  ];

  if (report.gate) {
    lines.push(`**Gate failures:** ${report.gate_failed}`);
  }

  lines.push("");

  for (const summary of report.fixture_summaries) {
    const icon = summary.passed ? "✅" : summary.gate_blocking ? "❌" : "⚠️";
    const tierLabel = summary.tier === "core" ? "core" : "edge/info";
    lines.push(
      `- ${icon} \`${summary.fixture_id}\` [${tierLabel}] best=${(summary.best_text_match_rate * 100).toFixed(0)}% elements=${(summary.element_match_rate * 100).toFixed(0)}% analyze=${summary.analyze_passed ? "pass" : "fail"} ocr=${summary.ocr_passed ? "pass" : "fail"}`,
    );
  }

  lines.push("");

  for (const result of report.results) {
    const icon = result.passed ? "✅" : result.gate_blocking ? "❌" : "⚠️";
    lines.push(`### ${icon} ${result.fixture_id} [${result.mode}] (${result.tier})`);
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

export function evalExitCode(report: EvalReport): number {
  if (report.gate) {
    return report.gate_failed > 0 ? 1 : 0;
  }
  return report.failed > 0 ? 1 : 0;
}
