import { describe, expect, it } from "vitest";
import {
  CORE_GATE_THRESHOLD,
  EDGE_DEFAULT_THRESHOLD,
  LEGACY_MATCH_THRESHOLD,
  evalExitCode,
  fixtureTier,
  matchText,
  overallTextMatchRate,
  renderEvalReport,
  thresholdForFixture,
} from "../../src/tools/eval.js";

describe("matchText", () => {
  it("computes match rate case-insensitively", () => {
    const result = matchText(["Hello", "World"], "hello there world");
    expect(result.matches).toEqual(["Hello", "World"]);
    expect(result.missing).toEqual([]);
    expect(result.rate).toBe(1);
  });

  it("returns rate 1 when no expected text", () => {
    expect(matchText([], "anything").rate).toBe(1);
  });
});

describe("fixtureTier", () => {
  it("defaults missing tier to core", () => {
    expect(
      fixtureTier({
        id: "x",
        file: "x.png",
        type: "simple",
        expected_text: [],
        expected_elements: [],
      }),
    ).toBe("core");
  });
});

describe("thresholdForFixture", () => {
  const coreFixture = {
    id: "web",
    file: "web.png",
    type: "web_page",
    tier: "core" as const,
    expected_text: [],
    expected_elements: [],
  };
  const edgeFixture = {
    id: "edge",
    file: "edge.png",
    type: "simple",
    tier: "edge" as const,
    expected_text: [],
    expected_elements: [],
  };

  it("uses legacy threshold when gate is off", () => {
    expect(thresholdForFixture(coreFixture, {})).toBe(LEGACY_MATCH_THRESHOLD);
  });

  it("uses core gate threshold when gate is on", () => {
    expect(thresholdForFixture(coreFixture, { gate: true })).toBe(CORE_GATE_THRESHOLD);
    expect(thresholdForFixture(edgeFixture, { gate: true })).toBe(EDGE_DEFAULT_THRESHOLD);
  });

  it("honors explicit threshold overrides", () => {
    expect(thresholdForFixture(coreFixture, { gate: true, threshold: 0.9 })).toBe(0.9);
    expect(thresholdForFixture(edgeFixture, { gate: true, edgeThreshold: 0.3 })).toBe(0.3);
  });
});

describe("overallTextMatchRate", () => {
  it("averages best per-fixture rates instead of double-counting analyze and ocr", () => {
    const fixtures = [
      {
        id: "a",
        file: "a.png",
        type: "simple",
        expected_text: ["one", "two"],
        expected_elements: [],
      },
    ];
    const summaries = [
      {
        fixture_id: "a",
        tier: "core" as const,
        passed: true,
        best_text_match_rate: 0.9,
        element_match_rate: 1,
        gate_blocking: false,
        analyze_passed: true,
        ocr_passed: false,
      },
    ];

    expect(overallTextMatchRate(fixtures, summaries)).toBe(0.9);
  });

  it("ignores fixtures without expected text", () => {
    const fixtures = [
      {
        id: "empty",
        file: "empty.png",
        type: "simple",
        expected_text: [],
        expected_elements: [],
      },
    ];
    const summaries = [
      {
        fixture_id: "empty",
        tier: "core" as const,
        passed: true,
        best_text_match_rate: 0,
        element_match_rate: 1,
        gate_blocking: false,
        analyze_passed: true,
        ocr_passed: true,
      },
    ];

    expect(overallTextMatchRate(fixtures, summaries)).toBe(1);
  });
});

describe("evalExitCode", () => {
  it("fails only on gate failures when gate mode is on", () => {
    expect(
      evalExitCode({
        gate: true,
        gate_failed: 0,
        failed: 3,
      } as never),
    ).toBe(0);
    expect(
      evalExitCode({
        gate: true,
        gate_failed: 1,
        failed: 1,
      } as never),
    ).toBe(1);
  });

  it("fails on any failed result when gate mode is off", () => {
    expect(
      evalExitCode({
        gate: false,
        gate_failed: 0,
        failed: 1,
      } as never),
    ).toBe(1);
  });
});

describe("renderEvalReport", () => {
  it("shows core and edge summary sections", () => {
    const text = renderEvalReport({
      timestamp: "2026-01-01T00:00:00.000Z",
      provider: "mock",
      model: "gpt-4o-mini",
      gate: true,
      threshold: 0.8,
      edge_threshold: 0.5,
      total: 2,
      passed: 1,
      failed: 1,
      overall_text_match_rate: 0.75,
      core_passed: 1,
      core_failed: 0,
      edge_passed: 0,
      edge_failed: 1,
      gate_failed: 0,
      fixture_summaries: [
        {
          fixture_id: "web-simple",
          tier: "core",
          passed: true,
          best_text_match_rate: 1,
          element_match_rate: 0.8,
          gate_blocking: false,
          analyze_passed: true,
          ocr_passed: true,
        },
        {
          fixture_id: "cjk-text",
          tier: "edge",
          passed: false,
          best_text_match_rate: 0.4,
          element_match_rate: 0.2,
          gate_blocking: false,
          analyze_passed: false,
          ocr_passed: false,
        },
      ],
      results: [],
    });

    expect(text).toContain("**Gate mode:** on");
    expect(text).toContain("**Core:** 1/1 passed");
    expect(text).toContain("**Edge (informational):** 0/1 passed");
    expect(text).toContain("cjk-text");
  });
});
