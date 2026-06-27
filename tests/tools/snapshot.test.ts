import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type SnapshotAction,
  type SnapshotEntry,
  buildSnapshot,
  extractStructure,
  loadSnapshot,
  saveSnapshot,
  snapshotPath,
  updateAllSnapshots,
  verifyAllSnapshots,
  verifySnapshot,
} from "../../src/tools/snapshot.js";

// ── extractStructure ───────────────────────────────────────────────────────────

describe("extractStructure", () => {
  it("maps string values to 'string'", () => {
    const result = extractStructure({ summary: "hello world", foo: "bar" });
    expect(result).toEqual({ summary: "string", foo: "string" });
  });

  it("maps number values to 'number'", () => {
    const result = extractStructure({ count: 42, rate: 0.85 });
    expect(result).toEqual({ count: "number", rate: "number" });
  });

  it("maps array values to 'array'", () => {
    const result = extractStructure({ items: [1, 2, 3], tags: ["a", "b"] });
    expect(result).toEqual({ items: "array", tags: "array" });
  });

  it("maps object values to 'object'", () => {
    const result = extractStructure({ nested: { a: 1 } });
    expect(result).toEqual({ nested: "object" });
  });

  it("maps boolean values to 'boolean'", () => {
    const result = extractStructure({ active: true });
    expect(result).toEqual({ active: "boolean" });
  });

  it("handles mixed types", () => {
    const result = extractStructure({
      summary: "text",
      count: 5,
      items: ["a", "b"],
      meta: { version: 1 },
      active: false,
    });
    expect(result).toEqual({
      summary: "string",
      count: "number",
      items: "array",
      meta: "object",
      active: "boolean",
    });
  });

  it("maps summary key to 'string'", () => {
    const result = extractStructure({ summary: "test" });
    expect(result.summary).toBe("string");
  });

  it("handles diff_image as string|undefined", () => {
    const result = extractStructure({ diff_image: "/path/to/diff.png" });
    expect(result.diff_image).toBe("string|undefined");
  });
});

// ── buildSnapshot ──────────────────────────────────────────────────────────────

describe("buildSnapshot", () => {
  it("captures fixture_id and mode", () => {
    const snapshot = buildSnapshot("test-fixture", "analyze", {
      summary: "test",
      observations: [{ id: "1", content: "obs" }],
      inferences: [],
    });
    expect(snapshot.fixture_id).toBe("test-fixture");
    expect(snapshot.mode).toBe("analyze");
  });

  it("counts top-level keys", () => {
    const snapshot = buildSnapshot("f1", "analyze", {
      summary: "test",
      observations: [],
      inferences: [],
      meta: { ok: true },
    });
    expect(snapshot.key_count).toBe(4);
  });

  it("records array lengths", () => {
    const snapshot = buildSnapshot("f1", "ocr", {
      summary: "test",
      visible_text: [{ text: "a" }, { text: "b" }, { text: "c" }],
      warnings: ["warn"],
    });
    expect(snapshot.array_lengths).toEqual({
      visible_text: 3,
      warnings: 1,
    });
  });

  it("records object_keys", () => {
    const snapshot = buildSnapshot("f1", "analyze", {
      summary: "test",
      observations: [],
      config: { detail: "high" },
    });
    expect(snapshot.object_keys).toContain("config");
  });
});

// ── verifySnapshot ─────────────────────────────────────────────────────────────

describe("verifySnapshot", () => {
  const baseSnapshot: SnapshotEntry = {
    fixture_id: "f1",
    mode: "analyze",
    structure: { summary: "string", count: "number", items: "array" },
    key_count: 3,
    array_lengths: { items: 5 },
    object_keys: [],
  };

  it("returns empty details for identical snapshots", () => {
    const current: SnapshotEntry = { ...baseSnapshot };
    expect(verifySnapshot(baseSnapshot, current)).toEqual([]);
  });

  it("detects key count changes", () => {
    const current = { ...baseSnapshot, key_count: 4 };
    const details = verifySnapshot(baseSnapshot, current);
    expect(details).toContain("key_count changed: 3 → 4");
  });

  it("detects type changes", () => {
    const current: SnapshotEntry = {
      ...baseSnapshot,
      structure: { summary: "number", count: "number", items: "array" },
    };
    const details = verifySnapshot(baseSnapshot, current);
    expect(details).toContain("type change for summary: string → number");
  });

  it("detects missing keys", () => {
    const current: SnapshotEntry = {
      ...baseSnapshot,
      structure: { summary: "string", count: "number" },
      key_count: 2,
    };
    const details = verifySnapshot(baseSnapshot, current);
    expect(details).toContain("missing key: items");
  });

  it("detects new unexpected keys", () => {
    const current: SnapshotEntry = {
      ...baseSnapshot,
      structure: { summary: "string", count: "number", items: "array", extra: "boolean" },
      key_count: 4,
    };
    const details = verifySnapshot(baseSnapshot, current);
    expect(details).toContain("new unexpected key: extra");
  });

  it("detects array length changes beyond tolerance", () => {
    const current: SnapshotEntry = {
      ...baseSnapshot,
      array_lengths: { items: 10 },
    };
    const details = verifySnapshot(baseSnapshot, current);
    expect(details.some((d) => d.includes("items") && d.includes("5 → 10"))).toBe(true);
  });

  it("tolerates small array length changes within ±20%", () => {
    // 5 ±20% = ±1 → 4..6 is within tolerance
    const current: SnapshotEntry = {
      ...baseSnapshot,
      array_lengths: { items: 6 },
    };
    expect(verifySnapshot(baseSnapshot, current)).toEqual([]);
  });

  it("reports array key missing", () => {
    const current: SnapshotEntry = {
      ...baseSnapshot,
      array_lengths: {},
    };
    const details = verifySnapshot(baseSnapshot, current);
    expect(details.some((d) => d.includes("array key missing: items"))).toBe(true);
  });
});

// ── saveSnapshot / loadSnapshot ────────────────────────────────────────────────

describe("saveSnapshot / loadSnapshot", () => {
  const tmpDir = resolve(import.meta.dirname, "../../tests/fixtures/golden");

  const snapshot: SnapshotEntry = {
    fixture_id: "test-fixture",
    mode: "analyze",
    structure: { summary: "string" },
    key_count: 1,
    array_lengths: {},
    object_keys: [],
  };

  it("saves and loads a snapshot", () => {
    saveSnapshot(tmpDir, snapshot);
    const loaded = loadSnapshot(tmpDir, "test-fixture", "analyze");
    expect(loaded).not.toBeNull();
    expect(loaded?.fixture_id).toBe("test-fixture");
    expect(loaded?.key_count).toBe(1);
    expect(loaded?.structure).toEqual({ summary: "string" });
  });

  it("returns null for missing snapshot", () => {
    const loaded = loadSnapshot(tmpDir, "nonexistent-fixture", "ocr");
    expect(loaded).toBeNull();
  });
});
