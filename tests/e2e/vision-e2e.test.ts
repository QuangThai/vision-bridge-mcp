import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { analyzeImage } from "../../src/tools/analyze-image.js";
import { analyzeUiScreenshot } from "../../src/tools/analyze-ui-screenshot.js";
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

function hasApiKey(): boolean {
  tryLoadDotenv();
  return !!process.env.VISION_API_KEY;
}

const TEST_IMAGE = resolve(import.meta.dirname, "screenshot.png");

function buildDeps() {
  return { config: loadConfig(), cwd: process.cwd() };
}

describe("E2E: real vision provider", () => {
  const canRun = hasApiKey();
  const LONG_TIMEOUT = 60_000;

  it.runIf(canRun)("analyze_image reads example.com screenshot", async () => {
    const result = await analyzeImage(
      {
        image_path: TEST_IMAGE,
        mode: "general",
        detail_level: "standard",
      },
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

    console.log("=== analyze_image ===");
    console.log("Summary:", result.structured.summary);
    console.log("Observations:", result.structured.observations.length);
    console.log("Inferences:", result.structured.inferences.length);
  });

  it.runIf(canRun)("ocr_image extracts visible text", async () => {
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

    console.log("=== ocr_image ===");
    console.log("Summary:", result.structured.summary);
    console.log("Visible text blocks:", result.structured.visible_text.length);
    console.log("Warnings:", result.structured.warnings);
    for (const block of result.structured.visible_text) {
      console.log(`  [${block.region}] ${block.text} (${block.confidence})`);
    }
  });

  it.runIf(canRun)("analyze_ui_screenshot identifies page structure", async () => {
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

    console.log("=== analyze_ui_screenshot ===");
    console.log("Summary:", result.structured.summary);
    console.log("Screen type:", result.structured.screen_type);
    console.log("UI elements:", result.structured.ui_elements.length);
    console.log("Implementation plan steps:", result.structured.implementation_plan.length);
    for (const el of result.structured.ui_elements) {
      console.log(`  [${el.type}] "${el.label}" @ ${el.position} (${el.confidence})`);
    }
  });
});

const AGENTSVIEW_IMAGES = [
  { file: "agentsview-agent-architecture.png", label: "agent architecture" },
  { file: "agentsview-architecture-focused.png", label: "architecture focused" },
  { file: "agentsview-company-architecture.png", label: "company architecture" },
];

describe("E2E: agentsview complex images", () => {
  const canRun = hasApiKey();

  for (const img of AGENTSVIEW_IMAGES) {
    const imgPath = resolve(import.meta.dirname, img.file);

    it.runIf(canRun)(`${img.label}: analyze_image extracts structure`, async () => {
      const result = await analyzeImage(
        {
          image_path: imgPath,
          mode: "diagram",
          detail_level: "standard",
        },
        { config: loadConfig(), cwd: process.cwd() },
      );

      expect(result).toBeDefined();
      expect(result.structured.summary).toBeTruthy();
      expect(result.structured.observations.length).toBeGreaterThan(0);

      console.log(`=== ${img.label} analyze_image ===`);
      console.log("Summary:", result.structured.summary);
      console.log("Observations:", result.structured.observations.length);
      console.log("Inferences:", result.structured.inferences.length);
      for (const obs of result.structured.observations.slice(0, 5)) {
        console.log(`  [${obs.type}] ${obs.content} (${obs.confidence})`);
      }
      if (result.structured.observations.length > 5) {
        console.log(`  ... and ${result.structured.observations.length - 5} more`);
      }
    });

    it.runIf(canRun)(`${img.label}: ocr_image extracts text`, async () => {
      const result = await ocrImage(
        {
          image_path: imgPath,
          preserve_layout: true,
          extract_tables: false,
          extract_code: false,
        },
        { config: loadConfig(), cwd: process.cwd() },
      );

      expect(result).toBeDefined();
      expect(result.structured.summary).toBeTruthy();

      console.log(`=== ${img.label} ocr_image ===`);
      console.log("Summary:", result.structured.summary);
      console.log("Visible text blocks:", result.structured.visible_text.length);
      for (const block of result.structured.visible_text.slice(0, 8)) {
        console.log(`  [${block.region}] ${block.text} (${block.confidence})`);
      }
      if (result.structured.visible_text.length > 8) {
        console.log(`  ... and ${result.structured.visible_text.length - 8} more`);
      }
      console.log("Warnings:", result.structured.warnings);
    });
  }
});
