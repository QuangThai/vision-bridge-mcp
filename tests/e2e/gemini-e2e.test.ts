import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { analyzeImageBatch } from "../../src/tools/analyze-image-batch.js";
import { analyzeImage } from "../../src/tools/analyze-image.js";
import { analyzeUiScreenshot } from "../../src/tools/analyze-ui-screenshot.js";
import { compareImages } from "../../src/tools/compare-images.js";
import { extractRegion } from "../../src/tools/extract-region.js";
import { ocrImage } from "../../src/tools/ocr-image.js";

/**
 * Minimal .env parser — no dotenv dependency needed.
 */
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

/**
 * Check if we have a usable Gemini API key.
 * Reads GEMINI_KEY from .env (or process.env) and sets up
 * VISION_PROVIDER + VISION_API_KEY + VISION_MODEL for Gemini.
 * Returns true if Gemini is ready to test.
 */
function hasGeminiKey(): boolean {
  tryLoadDotenv();
  const geminiKey = process.env.GEMINI_KEY;
  if (!geminiKey) return false;

  // Set up Gemini provider config
  process.env.VISION_PROVIDER = "gemini";
  process.env.VISION_API_KEY = geminiKey;
  process.env.VISION_MODEL = "gemini-3.5-flash";

  return true;
}

/**
 * Build deps with fresh config (reads the env vars we just set).
 */
function buildDeps() {
  return { config: loadConfig(), cwd: process.cwd() };
}

// ---------------------------------------------------------------------------
// Test image paths
// ---------------------------------------------------------------------------
const GOLDEN_DIR = resolve(import.meta.dirname, "../fixtures/golden");
const TEST_IMAGE = resolve(import.meta.dirname, "screenshot.png");

const DASHBOARD_BEFORE = resolve(GOLDEN_DIR, "dashboard-before.png");
const DASHBOARD_AFTER = resolve(GOLDEN_DIR, "dashboard-after.png");
const WEB_SIMPLE = resolve(GOLDEN_DIR, "web-simple.png");
const RECEIPT_IMAGE = resolve(GOLDEN_DIR, "receipt.png");
const DIAGRAM_ARCH = resolve(GOLDEN_DIR, "diagram-agent-arch.png");

const LONG_TIMEOUT = 60_000;

// ===========================================================================
// 1) Basic tools — analyze_image, ocr_image, analyze_ui_screenshot
// ===========================================================================
describe("Gemini E2E: basic vision tools", () => {
  const canRun = hasGeminiKey();

  it.runIf(canRun)(
    "analyze_image reads example.com screenshot",
    async () => {
      const result = await analyzeImage(
        { image_path: TEST_IMAGE, mode: "general", detail_level: "standard" },
        buildDeps(),
      );

      expect(result).toBeDefined();
      expect(result.structured.summary).toBeTruthy();
      expect(result.structured.observations.length).toBeGreaterThan(0);
      expect(result.structured.inferences).toBeDefined();
      expect(result.structured.uncertainties).toBeDefined();
      expect(result.markdown.length).toBeGreaterThan(10);

      for (const obs of result.structured.observations) {
        expect(obs.confidence).toBeGreaterThanOrEqual(0);
        expect(obs.confidence).toBeLessThanOrEqual(1);
      }

      console.log("=== Gemini analyze_image ===");
      console.log("Summary:", result.structured.summary);
      console.log("Observations:", result.structured.observations.length);
      console.log("Inferences:", result.structured.inferences.length);
    },
    LONG_TIMEOUT,
  );

  it.runIf(canRun)(
    "ocr_image extracts visible text",
    async () => {
      const result = await ocrImage(
        {
          image_path: TEST_IMAGE,
          preserve_layout: true,
          extract_tables: false,
          extract_code: false,
        },
        buildDeps(),
      );

      expect(result).toBeDefined();
      expect(result.structured.summary).toBeTruthy();
      expect(result.structured.visible_text.length).toBeGreaterThan(0);
      expect(result.structured.warnings.length).toBeGreaterThan(0);

      for (const block of result.structured.visible_text) {
        expect(block.text).toBeTruthy();
        expect(block.confidence).toBeGreaterThanOrEqual(0);
        expect(block.confidence).toBeLessThanOrEqual(1);
      }

      console.log("=== Gemini ocr_image ===");
      console.log("Summary:", result.structured.summary);
      console.log("Visible text blocks:", result.structured.visible_text.length);
      for (const block of result.structured.visible_text) {
        console.log(`  [${block.region}] ${block.text} (${block.confidence})`);
      }
    },
    LONG_TIMEOUT,
  );

  it.runIf(canRun)(
    "analyze_ui_screenshot identifies page structure",
    async () => {
      const result = await analyzeUiScreenshot(
        {
          image_path: TEST_IMAGE,
          target_framework: "unknown",
          style_system: "unknown",
          goal: "describe",
        },
        buildDeps(),
      );

      expect(result).toBeDefined();
      expect(result.structured.summary).toBeTruthy();
      expect(result.structured.screen_type).toBeTruthy();
      expect(result.structured.ui_elements).toBeDefined();
      expect(result.structured.layout).toBeDefined();

      for (const el of result.structured.ui_elements) {
        expect(el.type).toBeTruthy();
        expect(el.label).toBeDefined();
        expect(el.confidence).toBeGreaterThanOrEqual(0);
        expect(el.confidence).toBeLessThanOrEqual(1);
      }

      console.log("=== Gemini analyze_ui_screenshot ===");
      console.log("Summary:", result.structured.summary);
      console.log("Screen type:", result.structured.screen_type);
      console.log("UI elements:", result.structured.ui_elements.length);
      console.log("Implementation plan steps:", result.structured.implementation_plan.length);
      for (const el of result.structured.ui_elements) {
        console.log(`  [${el.type}] "${el.label}" @ ${el.position} (${el.confidence})`);
      }
    },
    LONG_TIMEOUT,
  );
});

// ===========================================================================
// 2) Complex images — diagrams, documents
// ===========================================================================
const COMPLEX_IMAGES = [
  { file: "diagram-agent-arch.png", label: "agent architecture diagram" },
  { file: "receipt.png", label: "receipt document" },
  { file: "web-simple.png", label: "simple web page" },
];

describe("Gemini E2E: complex images", () => {
  const canRun = hasGeminiKey();

  for (const img of COMPLEX_IMAGES) {
    const imgPath = resolve(GOLDEN_DIR, img.file);

    it.runIf(canRun)(
      `${img.label}: analyze_image extracts structure`,
      async () => {
        const result = await analyzeImage(
          { image_path: imgPath, mode: "general", detail_level: "standard" },
          buildDeps(),
        );

        expect(result).toBeDefined();
        expect(result.structured.summary).toBeTruthy();
        expect(result.structured.observations.length).toBeGreaterThan(0);

        console.log(`=== Gemini ${img.label} analyze_image ===`);
        console.log("Summary:", result.structured.summary);
        console.log("Observations:", result.structured.observations.length);
        console.log("Inferences:", result.structured.inferences.length);
        for (const obs of result.structured.observations.slice(0, 5)) {
          console.log(`  [${obs.type}] ${obs.content} (${obs.confidence})`);
        }
        if (result.structured.observations.length > 5) {
          console.log(`  ... and ${result.structured.observations.length - 5} more`);
        }
      },
      LONG_TIMEOUT,
    );

    it.runIf(canRun)(
      `${img.label}: ocr_image extracts text`,
      async () => {
        const result = await ocrImage(
          {
            image_path: imgPath,
            preserve_layout: true,
            extract_tables: false,
            extract_code: false,
          },
          buildDeps(),
        );

        expect(result).toBeDefined();
        expect(result.structured.summary).toBeTruthy();

        console.log(`=== Gemini ${img.label} ocr_image ===`);
        console.log("Summary:", result.structured.summary);
        console.log("Visible text blocks:", result.structured.visible_text.length);
        for (const block of result.structured.visible_text.slice(0, 8)) {
          console.log(`  [${block.region}] ${block.text} (${block.confidence})`);
        }
        if (result.structured.visible_text.length > 8) {
          console.log(`  ... and ${result.structured.visible_text.length - 8} more`);
        }
      },
      LONG_TIMEOUT,
    );
  }
});

// ===========================================================================
// 3) compare_images
// ===========================================================================
describe("Gemini E2E: compare_images", () => {
  const canRun = hasGeminiKey();

  it.runIf(canRun)(
    "compares dashboard before/after and detects changes",
    async () => {
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
      expect(result.structured.recommended_next_steps.length).toBeGreaterThan(0);

      for (const diff of result.structured.differences) {
        expect(diff.type).toBeDefined();
        expect(diff.severity).toBeDefined();
        expect(diff.confidence).toBeGreaterThanOrEqual(0);
        expect(diff.confidence).toBeLessThanOrEqual(1);
      }

      console.log("=== Gemini compare_images ===");
      console.log("Summary:", result.structured.summary);
      console.log("Differences found:", result.structured.differences.length);
      console.log("Regression likelihood:", result.structured.regression_likelihood);
      for (const diff of result.structured.differences) {
        console.log(
          `  [${diff.type}] ${diff.description} (severity: ${diff.severity}, confidence: ${diff.confidence})`,
        );
      }
    },
    LONG_TIMEOUT,
  );

  it.runIf(canRun)(
    "compare_images with --diff generates visual diff image",
    async () => {
      const diffPath = resolve(import.meta.dirname, "_gemini-e2e-diff-output.png");
      try {
        const result = await compareImages(
          {
            before_path: DASHBOARD_BEFORE,
            after_path: DASHBOARD_AFTER,
            focus: "general",
            severity_threshold: "low",
            diff_path: diffPath,
          },
          buildDeps(),
        );

        expect(result.structured.diff_image).toBeTruthy();
        expect(existsSync(diffPath)).toBe(true);

        console.log("=== Gemini compare_images with diff ===");
        console.log("Diff image path:", result.structured.diff_image);
      } finally {
        try {
          unlinkSync(diffPath);
        } catch {
          /* ignore */
        }
      }
    },
    LONG_TIMEOUT,
  );
});

// ===========================================================================
// 4) extract_region
// ===========================================================================
describe("Gemini E2E: extract_region", () => {
  const canRun = hasGeminiKey();

  it.runIf(canRun)(
    "extracts header region from dashboard image",
    async () => {
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

      console.log("=== Gemini extract_region ===");
      console.log("Summary:", result.structured.summary);
      console.log("Observations:", result.structured.observations.length);
      console.log("Cropped region:", result.regionCrop);
    },
    LONG_TIMEOUT,
  );
});

// ===========================================================================
// 5) analyze_image_batch
// ===========================================================================
describe("Gemini E2E: analyze_image_batch", () => {
  const canRun = hasGeminiKey();
  const BATCH_TIMEOUT = 120_000;

  it.runIf(canRun)(
    "processes multiple golden fixtures in batch",
    async () => {
      const result = await analyzeImageBatch(
        {
          images: [
            { image_path: WEB_SIMPLE, mode: "general" },
            { image_path: RECEIPT_IMAGE, mode: "document" },
          ],
          detail_level: "brief",
        },
        buildDeps(),
      );

      expect(result).toBeDefined();
      expect(result.structured.summary).toBeTruthy();
      expect(result.structured.total_processed).toBe(2);
      expect(result.structured.items.length).toBe(2);
      expect(result.structured.failed_count).toBe(0);

      for (const item of result.structured.items) {
        expect(item.result.summary).toBeTruthy();
        expect(item.result.observations.length).toBeGreaterThan(0);
      }

      console.log("=== Gemini analyze_image_batch ===");
      console.log("Summary:", result.structured.summary);
      console.log("Items processed:", result.structured.items.length);
      for (const item of result.structured.items) {
        console.log(
          `  [${item.index}] ${item.image_path}: ${item.result.observations.length} observations`,
        );
      }
    },
    BATCH_TIMEOUT,
  );

  it.runIf(canRun)(
    "batch handles partial failures gracefully",
    async () => {
      const result = await analyzeImageBatch(
        {
          images: [
            { image_path: WEB_SIMPLE, mode: "general" },
            { image_path: "/nonexistent/path.png", mode: "general" },
          ],
          detail_level: "brief",
        },
        buildDeps(),
      );

      expect(result).toBeDefined();
      expect(result.structured.total_processed).toBeGreaterThanOrEqual(1);
      expect(result.structured.items.length).toBeGreaterThanOrEqual(1);

      console.log("=== Gemini analyze_image_batch partial failure ===");
      console.log("Items:", result.structured.items.length);
      console.log("Errors:", result.structured.errors);
    },
    BATCH_TIMEOUT,
  );
});

// ===========================================================================
// 6) image_url support (works with any provider)
// ===========================================================================
describe("Gemini E2E: image_url support", () => {
  const URL_PNG = "https://picsum.photos/400/300";
  const URL_PNG_ALT = "https://picsum.photos/200/200";

  it.runIf(hasGeminiKey())(
    "analyze_image accepts image_url",
    async () => {
      const result = await analyzeImage({ image_url: URL_PNG, mode: "general" }, buildDeps());

      expect(result.markdown).toBeTruthy();
      expect(result.image.sourceUrl).toBe(URL_PNG);
      expect(result.structured.observations.length).toBeGreaterThan(0);
      expect(result.structured.summary).toBeTruthy();
    },
    LONG_TIMEOUT,
  );

  it.runIf(hasGeminiKey())(
    "ocr_image accepts image_url",
    async () => {
      const result = await ocrImage({ image_url: URL_PNG, preserve_layout: true }, buildDeps());

      expect(result.markdown).toBeTruthy();
      expect(result.structured.visible_text).toBeDefined();
    },
    LONG_TIMEOUT,
  );

  it.runIf(hasGeminiKey())(
    "extract_region accepts image_url",
    async () => {
      const result = await extractRegion(
        {
          image_url: URL_PNG,
          region: { x: 0, y: 0, width: 100, height: 50 },
          mode: "general",
        },
        buildDeps(),
      );

      expect(result.markdown).toContain("Extracted Region");
      expect(result.regionCrop).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    },
    LONG_TIMEOUT,
  );

  it.runIf(hasGeminiKey())(
    "analyze_ui_screenshot accepts image_url",
    async () => {
      const result = await analyzeUiScreenshot(
        { image_url: URL_PNG, target_framework: "react", goal: "describe" },
        buildDeps(),
      );

      expect(result.markdown).toBeTruthy();
    },
    LONG_TIMEOUT,
  );

  it.runIf(hasGeminiKey())(
    "compare_images accepts before_url and after_url",
    async () => {
      const result = await compareImages(
        { before_url: URL_PNG, after_url: URL_PNG_ALT, focus: "general" },
        buildDeps(),
      );

      expect(result.markdown).toBeTruthy();
      expect(result.structured.differences).toBeDefined();
    },
    LONG_TIMEOUT,
  );

  it.runIf(hasGeminiKey())(
    "analyze_image_batch accepts image_url",
    async () => {
      const result = await analyzeImageBatch(
        {
          images: [
            { image_url: URL_PNG, mode: "general" },
            { image_url: URL_PNG_ALT, mode: "general" },
          ],
        },
        buildDeps(),
      );

      expect(result.structured.items).toHaveLength(2);
      expect(result.structured.total_processed).toBe(2);
    },
    LONG_TIMEOUT,
  );
});

// ===========================================================================
// 7) Error modes (no API key required — always run)
// ===========================================================================
describe("Gemini E2E: error modes", () => {
  it("analyze_image rejects nonexistent path", async () => {
    await expect(
      analyzeImage(
        { image_path: "/nonexistent/path/to/image.png", mode: "general" },
        { config: loadConfig(), cwd: process.cwd() },
      ),
    ).rejects.toThrow();
  });

  it("ocr_image rejects nonexistent path", async () => {
    await expect(
      ocrImage(
        { image_path: "/nonexistent/path/to/image.png" },
        { config: loadConfig(), cwd: process.cwd() },
      ),
    ).rejects.toThrow();
  });

  it("extract_region rejects nonexistent path", async () => {
    await expect(
      extractRegion(
        {
          image_path: "/nonexistent/image.png",
          region: { x: 0, y: 0, width: 100, height: 100 },
          mode: "general",
        },
        { config: loadConfig(), cwd: process.cwd() },
      ),
    ).rejects.toThrow();
  });

  it("compare_images rejects nonexistent paths", async () => {
    await expect(
      compareImages(
        {
          before_path: "/nonexistent/before.png",
          after_path: "/nonexistent/after.png",
          focus: "general",
          severity_threshold: "low",
        },
        { config: loadConfig(), cwd: process.cwd() },
      ),
    ).rejects.toThrow();
  });
});
