#!/usr/bin/env node
/**
 * Generate golden fixture images for the eval suite.
 *
 * Run: node tests/fixtures/generate-fixtures.mjs
 *
 * Uses sharp to create programmatic test images representing common
 * edge cases that vision providers should handle.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "golden");

async function main() {
  await mkdir(OUT, { recursive: true });
  const sharp = (await import("sharp")).default;

  const fixtures = [];

  // 1. Solid color image (low-information test)
  {
    const buf = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 200, b: 200 } },
    })
      .png()
      .toBuffer();
    await writeFile(resolve(OUT, "solid-color.png"), buf);
    fixtures.push({
      id: "solid-color",
      file: "solid-color.png",
      source: "programmatic solid gray rectangle",
      width: 800,
      height: 600,
      type: "simple",
      expected_text: [],
      expected_elements: [],
    });
  }

  // 2. Smooth gradient (tests color variation detection)
  {
    const width = 800;
    const height = 600;
    const pixels = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        pixels[idx] = Math.floor((x / width) * 255); // R gradient
        pixels[idx + 1] = Math.floor((y / height) * 255); // G gradient
        pixels[idx + 2] = 128; // B constant
      }
    }
    const buf = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();
    await writeFile(resolve(OUT, "gradient.png"), buf);
    fixtures.push({
      id: "gradient",
      file: "gradient.png",
      source: "programmatic smooth color gradient",
      width,
      height,
      type: "simple",
      expected_text: [],
      expected_elements: [],
    });
  }

  // 3. Dark image (low-light test)
  {
    const buf = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 10, b: 20 } },
    })
      .png()
      .toBuffer();
    await writeFile(resolve(OUT, "dark.png"), buf);
    fixtures.push({
      id: "dark",
      file: "dark.png",
      source: "programmatic near-black rectangle (low-light edge case)",
      width: 800,
      height: 600,
      type: "simple",
      expected_text: [],
      expected_elements: [],
    });
  }

  // 4. High-contrast text-like pattern (simulates code screenshot)
  {
    const width = 1200;
    const height = 800;
    const pixels = Buffer.alloc(width * height * 3, 240); // light gray bg
    // Draw horizontal lines simulating text rows
    const colors = [
      [0, 0, 0], // black
      [0, 0, 200], // blue
      [0, 150, 0], // green
      [200, 100, 0], // orange
    ];
    for (let row = 0; row < 20; row++) {
      const y = 40 + row * 35;
      const color = colors[row % colors.length];
      for (let x = 40; x < width - 40; x += 2) {
        const idx = (y * width + x) * 3;
        pixels[idx] = color[0];
        pixels[idx + 1] = color[1];
        pixels[idx + 2] = color[2];
      }
    }
    const buf = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();
    await writeFile(resolve(OUT, "code-lines.png"), buf);
    fixtures.push({
      id: "code-lines",
      file: "code-lines.png",
      source: "programmatic horizontal colored lines simulating code",
      width,
      height,
      type: "simple",
      expected_text: [],
      expected_elements: ["lines", "horizontal", "color"],
    });
  }

  // 5. Blurry image (simulated via resize upscale)
  {
    const small = await sharp({
      create: { width: 50, height: 40, channels: 3, background: { r: 100, g: 150, b: 200 } },
    })
      .png()
      .toBuffer();
    const buf = await sharp(small).resize(800, 600, { kernel: "nearest" }).png().toBuffer();
    await writeFile(resolve(OUT, "blurry.png"), buf);
    fixtures.push({
      id: "blurry",
      file: "blurry.png",
      source: "programmatic upscaled image simulating blurry/lo-res input",
      width: 800,
      height: 600,
      type: "simple",
      expected_text: [],
      expected_elements: [],
    });
  }

  // 6. Small icon-sized image (16x16)
  {
    const buf = await sharp({
      create: { width: 16, height: 16, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    await writeFile(resolve(OUT, "tiny-icon.png"), buf);
    fixtures.push({
      id: "tiny-icon",
      file: "tiny-icon.png",
      source: "programmatic 16x16 red square (icon-sized edge case)",
      width: 16,
      height: 16,
      type: "simple",
      expected_text: [],
      expected_elements: [],
    });
  }

  // 7. Table-like grid pattern
  {
    const width = 800;
    const height = 600;
    const pixels = Buffer.alloc(width * height * 3, 255);
    const gridColor = [200, 200, 200];
    // Vertical lines
    for (let x = 0; x < width; x += 100) {
      for (let y = 0; y < height; y++) {
        const idx = (y * width + x) * 3;
        pixels[idx] = gridColor[0];
        pixels[idx + 1] = gridColor[1];
        pixels[idx + 2] = gridColor[2];
      }
    }
    // Horizontal lines
    for (let y = 0; y < height; y += 50) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 3;
        pixels[idx] = gridColor[0];
        pixels[idx + 1] = gridColor[1];
        pixels[idx + 2] = gridColor[2];
      }
    }
    const buf = await sharp(pixels, { raw: { width, height, channels: 3 } })
      .png()
      .toBuffer();
    await writeFile(resolve(OUT, "table-grid.png"), buf);
    fixtures.push({
      id: "table-grid",
      file: "table-grid.png",
      source: "programmatic grid pattern simulating a table structure",
      width,
      height,
      type: "simple",
      expected_text: [],
      expected_elements: ["grid", "table", "cells"],
    });
  }

  // 8. Very wide image (panorama aspect ratio)
  {
    const buf = await sharp({
      create: { width: 3000, height: 300, channels: 3, background: { r: 50, g: 100, b: 150 } },
    })
      .png()
      .toBuffer();
    await writeFile(resolve(OUT, "wide.png"), buf);
    fixtures.push({
      id: "wide",
      file: "wide.png",
      source: "programmatic 3000x300 wide image (extreme aspect ratio)",
      width: 3000,
      height: 300,
      type: "simple",
      expected_text: [],
      expected_elements: [],
    });
  }

  // Write manifest
  const manifest = {
    description:
      "Golden fixtures for atlas-vision eval. Includes original web screenshots plus programmatic edge-case images.",
    fixtures: [
      // Original fixtures preserved
      {
        id: "web-simple",
        file: "web-simple.png",
        source: "screenshot of example.com",
        width: 1280,
        height: 800,
        type: "web_page",
        expected_text: ["Example Domain", "Learn more", "documentation examples"],
        expected_elements: ["heading", "paragraph", "link"],
      },
      {
        id: "diagram-agent-arch",
        file: "diagram-agent-arch.png",
        source: "screenshot of agent architecture diagram",
        width: 1920,
        height: 1080,
        type: "diagram",
        expected_text: [
          "AgentsView",
          "Local Runtime",
          "Enforcement Plane",
          "File Watcher",
          "PostgreSQL",
        ],
        expected_elements: ["nodes", "edges", "labels", "legend"],
      },
      {
        id: "diagram-company-arch",
        file: "diagram-company-arch.png",
        source: "screenshot of company architecture diagram",
        width: 1920,
        height: 1080,
        type: "diagram",
        expected_text: ["AI agents", "Session files", "Control Plane", "Policy Enforcement"],
        expected_elements: ["nodes", "edges", "labels", "flow arrows"],
      },
      {
        id: "chart-revenue",
        file: "chart-revenue.png",
        source: "screenshot of bar chart showing Q1 2026 revenue",
        width: 1280,
        height: 720,
        type: "chart",
        expected_text: ["Monthly Revenue", "Jan", "Feb", "Mar", "Total Revenue"],
        expected_elements: ["bar chart", "labels", "values"],
      },
      {
        id: "error-dialog",
        file: "error-dialog.png",
        source: "screenshot of error dialog with retry/cancel actions",
        width: 1047,
        height: 751,
        type: "error_screenshot",
        expected_text: ["Connection Failed", "ERR_CONNECTION_TIMED_OUT", "Retry", "Cancel"],
        expected_elements: ["error icon", "heading", "paragraph", "buttons"],
      },
      {
        id: "form-ui",
        file: "form-ui.png",
        source: "screenshot of sign-up form with validation error",
        width: 1047,
        height: 751,
        type: "form",
        expected_text: ["Create Account", "Full name", "Password", "Sign Up", "Terms of Service"],
        expected_elements: ["input fields", "checkbox", "submit button", "error message"],
      },
      {
        id: "dashboard",
        file: "dashboard.png",
        source: "screenshot of analytics dashboard with stats and orders table",
        width: 1047,
        height: 751,
        type: "dashboard",
        expected_text: ["Dashboard", "Total Revenue", "Active Users", "Orders", "Bounce Rate"],
        expected_elements: ["stat cards", "table", "activity feed", "badges"],
      },
      {
        id: "dark-mode-ui",
        file: "dark-mode-ui.png",
        source: "screenshot of settings panel in dark mode",
        width: 1047,
        height: 751,
        type: "ui_dark",
        expected_text: [
          "Settings",
          "Dark mode",
          "Compact view",
          "Language",
          "Save Changes",
          "Notifications",
        ],
        expected_elements: ["sidebar", "toggles", "dropdown", "buttons", "dark theme"],
      },
      // New edge-case fixtures (programmatic)
      ...fixtures,
    ],
  };

  await writeFile(resolve(OUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Generated ${fixtures.length} edge-case fixtures in ${OUT}`);
  console.log(`Total fixtures in manifest: ${manifest.fixtures.length}`);
}

main().catch(console.error);
