import { describe, expect, it } from "vitest";
import {
  clampConfidence,
  extractJsonFromText,
  normalizeAnalyzeImageOutput,
  stableId,
} from "../../src/extraction/normalize.js";
import { analyzeImageOutputSchema } from "../../src/extraction/schemas.js";

describe("normalize helpers", () => {
  it("clamps confidence to 0..1", () => {
    expect(clampConfidence(1.5)).toBe(1);
    expect(clampConfidence(-0.2)).toBe(0);
    expect(clampConfidence("0.42")).toBe(0.42);
    expect(clampConfidence("bad", 0.3)).toBe(0.3);
  });

  it("creates stable ids", () => {
    expect(stableId("obs", 0)).toBe("obs_001");
    expect(stableId("inf", 9)).toBe("inf_010");
  });

  it("extracts json from fenced provider text", () => {
    const parsed = extractJsonFromText(
      'Intro\n```json\n{"summary":"ok","observations":[]}\n```\nTail',
    );
    expect(parsed).toEqual({ summary: "ok", observations: [] });
  });
});

describe("normalizeAnalyzeImageOutput", () => {
  const raw = {
    text: "fallback",
    provider: "openai-compatible",
    model: "gpt-4o-mini",
    raw: {},
  };

  it("normalizes structured provider json", () => {
    const output = normalizeAnalyzeImageOutput(
      {
        summary: "Login screen detected",
        observations: [
          {
            id: "obs_custom",
            type: "text",
            content: "Sign in",
            confidence: 1.2,
          },
        ],
        inferences: [
          {
            content: "Likely authentication form",
            confidence: 0.9,
            based_on: ["obs_custom"],
          },
        ],
        uncertainties: ["Exact colors unknown"],
        recommended_next_steps: ["Inspect form validation"],
      },
      raw,
      "./login.png",
    );

    const validated = analyzeImageOutputSchema.parse(output);
    expect(validated.summary).toBe("Login screen detected");
    expect(validated.observations[0]?.confidence).toBe(1);
    expect(validated.inferences[0]?.id).toMatch(/^inf_/);
    expect(validated.graph?.nodes.length).toBeGreaterThan(1);
    expect(validated.provider).toEqual({
      name: "openai-compatible",
      model: "gpt-4o-mini",
    });
    expect(validated.mermaid).toBeUndefined();
  });

  it("extracts mermaid from provider json", () => {
    const output = normalizeAnalyzeImageOutput(
      {
        summary: "Architecture diagram",
        observations: [{ type: "visual", content: "System flow", confidence: 0.9 }],
        mermaid: "graph TD\n  A-->B\n  B-->C",
      },
      raw,
      "./diagram.png",
    );

    const validated = analyzeImageOutputSchema.parse(output);
    expect(validated.mermaid).toBe("graph TD\n  A-->B\n  B-->C");
  });

  it("falls back when provider json is missing", () => {
    const output = normalizeAnalyzeImageOutput(null, raw, "./error.png", "Visible error text");
    expect(output.observations).toHaveLength(1);
    expect(output.uncertainties[0]).toMatch(/not valid JSON/i);
  });

  it("extracts tables from provider json", () => {
    const output = normalizeAnalyzeImageOutput(
      {
        summary: "Quarterly revenue chart",
        observations: [{ type: "visual", content: "Bar chart with 3 bars", confidence: 0.9 }],
        tables: [
          {
            caption: "Q1 2026 Revenue",
            headers: ["Month", "Revenue", "Growth"],
            rows: [
              { Month: "Jan", Revenue: 12000, Growth: "-" },
              { Month: "Feb", Revenue: 18000, Growth: "+50%" },
              { Month: "Mar", Revenue: 24000, Growth: "+33%" },
            ],
          },
        ],
      },
      raw,
      "./chart.png",
    );

    const validated = analyzeImageOutputSchema.parse(output);
    expect(validated.tables).toHaveLength(1);
    expect(validated.tables[0].caption).toBe("Q1 2026 Revenue");
    expect(validated.tables[0].rows).toHaveLength(3);
    expect(validated.tables[0].rows[1].Month).toBe("Feb");
  });

  it("defaults tables to empty array when missing", () => {
    const output = normalizeAnalyzeImageOutput(
      { summary: "Test", observations: [] },
      raw,
      "./test.png",
    );
    expect(output.tables).toEqual([]);
  });
});
