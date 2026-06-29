import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { analyzeImage } from "../../src/tools/analyze-image.js";
import { compareImages } from "../../src/tools/compare-images.js";
import { extractRegion } from "../../src/tools/extract-region.js";
import { ocrImage } from "../../src/tools/ocr-image.js";

function tryLoadDotenv(): void {
  const envPath = resolve(import.meta.dirname, "../../.env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function hasGeminiKey(): string | null {
  tryLoadDotenv();
  return process.env.GEMINI_KEY ?? null;
}

const GOLDEN_DIR = resolve(import.meta.dirname, "../fixtures/golden");
const TEST_IMAGE = resolve(import.meta.dirname, "screenshot.png");
const DASHBOARD_BEFORE = resolve(GOLDEN_DIR, "dashboard-before.png");
const DASHBOARD_AFTER = resolve(GOLDEN_DIR, "dashboard-after.png");

const MODELS = [
  { name: "gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { name: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" },
  { name: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite" },
];

const LONG_TIMEOUT = 120_000;

function buildDeps() {
  return { config: loadConfig(), cwd: process.cwd() };
}

// ===========================================================================
// Multi-model smoke tests
// ===========================================================================
for (const model of MODELS) {
  const geminiKey = hasGeminiKey();
  const canRun = !!geminiKey;

  function setupModel() {
    process.env.VISION_PROVIDER = "gemini";
    process.env.VISION_API_KEY = geminiKey as string;
    process.env.VISION_MODEL = model.name;
    process.env.ATLAS_DISABLE_CACHE = "true";
    process.env.ATLAS_TRACK_COSTS = "false";
  }

  describe(`Multi-model: ${model.label}`, () => {
    it.runIf(canRun)(
      "analyze_image",
      async () => {
        setupModel();
        const result = await analyzeImage(
          { image_path: TEST_IMAGE, mode: "general", detail_level: "standard" },
          buildDeps(),
        );
        expect(result).toBeDefined();
        expect(result.structured.summary).toBeTruthy();
        expect(result.structured.observations.length).toBeGreaterThan(0);
        expect(result.structured.inferences).toBeDefined();

        // Verify structured data integrity
        for (const obs of result.structured.observations) {
          expect(obs.confidence).toBeGreaterThanOrEqual(0);
          expect(obs.confidence).toBeLessThanOrEqual(1);
        }
        console.log(
          `  [${model.name}] analyze_image: ${result.structured.observations.length} obs, ${result.structured.inferences.length} inf`,
        );
      },
      LONG_TIMEOUT,
    );

    it.runIf(canRun)(
      "ocr_image",
      async () => {
        setupModel();
        const result = await ocrImage(
          { image_path: TEST_IMAGE, preserve_layout: true },
          buildDeps(),
        );
        expect(result).toBeDefined();
        expect(result.structured.summary).toBeTruthy();
        expect(result.structured.visible_text.length).toBeGreaterThan(0);
        for (const block of result.structured.visible_text) {
          expect(block.text).toBeTruthy();
          expect(block.confidence).toBeGreaterThanOrEqual(0);
          expect(block.confidence).toBeLessThanOrEqual(1);
        }
        console.log(
          `  [${model.name}] ocr_image: ${result.structured.visible_text.length} text blocks`,
        );
      },
      LONG_TIMEOUT,
    );

    it.runIf(canRun)(
      "compare_images",
      async () => {
        setupModel();
        const result = await compareImages(
          {
            before_path: DASHBOARD_BEFORE,
            after_path: DASHBOARD_AFTER,
            focus: "general",
            severity_threshold: "low",
          },
          buildDeps(),
        );
        expect(result).toBeDefined();
        expect(result.structured.summary).toBeTruthy();
        expect(result.structured.differences.length).toBeGreaterThan(0);
        expect(result.structured.regression_likelihood).toBeDefined();

        for (const diff of result.structured.differences) {
          expect(diff.type).toBeDefined();
          expect(diff.severity).toBeDefined();
          expect(diff.confidence).toBeGreaterThanOrEqual(0);
          expect(diff.confidence).toBeLessThanOrEqual(1);
        }
        console.log(
          `  [${model.name}] compare_images: ${result.structured.differences.length} diffs`,
        );
      },
      LONG_TIMEOUT,
    );

    it.runIf(canRun)(
      "extract_region",
      async () => {
        setupModel();
        const result = await extractRegion(
          {
            image_path: DASHBOARD_BEFORE,
            region: { x: 0, y: 0, width: 800, height: 60 },
            mode: "general",
            detail_level: "standard",
          },
          buildDeps(),
        );
        expect(result).toBeDefined();
        expect(result.structured.summary).toBeTruthy();
        expect(result.regionCrop).toBeDefined();
        expect(result.regionCrop.width).toBe(800);
        expect(result.regionCrop.height).toBe(60);
        console.log(
          `  [${model.name}] extract_region: ${result.structured.observations.length} obs`,
        );
      },
      LONG_TIMEOUT,
    );
  });
}
