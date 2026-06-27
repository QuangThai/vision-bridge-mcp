/**
 * JSON schema snapshot testing for golden fixture tool outputs.
 *
 * Snapshots capture the structural shape of tool outputs (all keys, value types,
 * array lengths) rather than exact content. This detects regressions in output
 * structure while tolerating natural variation in generated text.
 *
 * ## Usage
 *
 * ```bash
 * atlas-vision eval --snapshot verify   # verify against stored snapshots (default)
 * atlas-vision eval --snapshot update   # re-generate all snapshots
 * atlas-vision eval --snapshot skip     # skip snapshot checks
 * ```
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export type SnapshotAction = "verify" | "update" | "skip";

export interface SnapshotEntry {
  /** The fixture id this snapshot belongs to */
  fixture_id: string;
  /** The tool mode that produced this snapshot: "analyze" | "ocr" */
  mode: "analyze" | "ocr";
  /** Structural signature value types */
  structure: Record<string, unknown>;
  /** Total number of keys at top level */
  key_count: number;
  /** Length of each array-valued key */
  array_lengths: Record<string, number>;
  /** Keys whose values are objects */
  object_keys: string[];
}

export interface SnapshotDiff {
  fixture_id: string;
  mode: "analyze" | "ocr";
  passed: boolean;
  details: string[];
}

const SNAPSHOT_DIR = "snapshots";

/** Determine the snapshot file path for a fixture/mode combo. */
export function snapshotPath(goldenDir: string, fixtureId: string, mode: string): string {
  return resolve(goldenDir, SNAPSHOT_DIR, `${fixtureId}-${mode}.json`);
}

/**
 * Extract a structural signature from a tool output.
 * This captures shape but not exact content text.
 */
export function extractStructure(output: Record<string, unknown>): SnapshotEntry["structure"] {
  const structure: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(output)) {
    if (key === "summary" || key === "markdown") {
      structure[key] = "string";
    } else if (key === "diff_image") {
      structure[key] = "string|undefined";
    } else if (Array.isArray(value)) {
      structure[key] = "array";
    } else if (typeof value === "object" && value !== null) {
      structure[key] = "object";
    } else {
      structure[key] = typeof value;
    }
  }
  return structure;
}

/**
 * Build a complete snapshot entry from a raw tool output.
 */
export function buildSnapshot(
  fixtureId: string,
  mode: "analyze" | "ocr",
  output: Record<string, unknown>,
): SnapshotEntry {
  const structure = extractStructure(output);
  const arrayLengths: Record<string, number> = {};
  const objectKeys: string[] = [];

  for (const [key, value] of Object.entries(output)) {
    if (Array.isArray(value)) {
      arrayLengths[key] = value.length;
    } else if (typeof value === "object" && value !== null) {
      objectKeys.push(key);
    }
  }

  return {
    fixture_id: fixtureId,
    mode,
    structure,
    key_count: Object.keys(output).length,
    array_lengths: arrayLengths,
    object_keys: objectKeys,
  };
}

/**
 * Generate and save a snapshot to disk.
 */
export function saveSnapshot(goldenDir: string, snapshot: SnapshotEntry): void {
  const snapDir = resolve(goldenDir, SNAPSHOT_DIR);
  if (!existsSync(snapDir)) {
    mkdirSync(snapDir, { recursive: true });
  }
  const path = snapshotPath(goldenDir, snapshot.fixture_id, snapshot.mode);
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
}

/**
 * Load a stored snapshot from disk.
 */
export function loadSnapshot(
  goldenDir: string,
  fixtureId: string,
  mode: "analyze" | "ocr",
): SnapshotEntry | null {
  const path = snapshotPath(goldenDir, fixtureId, mode);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as SnapshotEntry;
  } catch {
    return null;
  }
}

/**
 * Verify current output against a stored snapshot.
 * Returns a list of diff details (empty = no differences).
 */
export function verifySnapshot(stored: SnapshotEntry, current: SnapshotEntry): string[] {
  const details: string[] = [];

  // Compare key count
  if (stored.key_count !== current.key_count) {
    details.push(`key_count changed: ${stored.key_count} → ${current.key_count}`);
  }

  // Compare structure (value types)
  for (const [key, expectedType] of Object.entries(stored.structure)) {
    const actualType = current.structure[key];
    if (actualType === undefined) {
      details.push(`missing key: ${key}`);
    } else if (expectedType !== actualType) {
      details.push(`type change for ${key}: ${expectedType} → ${actualType}`);
    }
  }

  // Check for unexpected new keys
  for (const key of Object.keys(current.structure)) {
    if (stored.structure[key] === undefined) {
      details.push(`new unexpected key: ${key}`);
    }
  }

  // Compare array lengths with tolerance (±20%, min 1)
  for (const [key, expectedLen] of Object.entries(stored.array_lengths)) {
    const actualLen = current.array_lengths[key];
    if (actualLen === undefined) {
      details.push(`array key missing: ${key}`);
      continue;
    }
    const tolerance = Math.max(1, Math.floor(expectedLen * 0.2));
    if (Math.abs(actualLen - expectedLen) > tolerance) {
      details.push(
        `array length change for ${key}: ${expectedLen} → ${actualLen} (tolerance: ±${tolerance})`,
      );
    }
  }

  return details;
}

/**
 * Verify all fixtures in a manifest against stored snapshots.
 * Returns a report of diffs per fixture.
 */
export function verifyAllSnapshots(
  goldenDir: string,
  report: {
    results: Array<{
      fixture_id: string;
      mode: "analyze" | "ocr";
      details: Record<string, unknown>;
    }>;
  },
): SnapshotDiff[] {
  const diffs: SnapshotDiff[] = [];

  for (const result of report.results) {
    const stored = loadSnapshot(goldenDir, result.fixture_id, result.mode);
    if (!stored) {
      diffs.push({
        fixture_id: result.fixture_id,
        mode: result.mode,
        passed: false,
        details: ["no stored snapshot found"],
      });
      continue;
    }

    // Build a snapshot-like structure from the current result details
    const currentOutput: Record<string, unknown> = {
      summary: result.details.summary ?? "",
      observations_count: result.details.observations_count ?? 0,
      text_blocks_count: result.details.text_blocks_count ?? 0,
      text_match_rate: result.details.text_match_rate ?? 0,
      matches_expected_text: result.details.matches_expected_text ?? [],
      missing_expected_text: result.details.missing_expected_text ?? [],
      matches_expected_elements: result.details.matches_expected_elements ?? [],
      missing_expected_elements: result.details.missing_expected_elements ?? [],
    };

    // Add errors if present
    if (result.details.errors) {
      currentOutput.errors = result.details.errors;
    }

    const currentSnapshot = buildSnapshot(result.fixture_id, result.mode, currentOutput);

    const details = verifySnapshot(stored, currentSnapshot);
    diffs.push({
      fixture_id: result.fixture_id,
      mode: result.mode,
      passed: details.length === 0,
      details: details.length > 0 ? details : ["no structural differences"],
    });
  }

  return diffs;
}

/**
 * Update all snapshots from an eval report.
 */
export function updateAllSnapshots(
  goldenDir: string,
  report: {
    results: Array<{
      fixture_id: string;
      mode: "analyze" | "ocr";
      details: Record<string, unknown>;
    }>;
  },
): number {
  let count = 0;
  for (const result of report.results) {
    const currentOutput: Record<string, unknown> = {
      summary: result.details.summary ?? "",
      observations_count: result.details.observations_count ?? 0,
      text_blocks_count: result.details.text_blocks_count ?? 0,
      text_match_rate: result.details.text_match_rate ?? 0,
      matches_expected_text: result.details.matches_expected_text ?? [],
      missing_expected_text: result.details.missing_expected_text ?? [],
      matches_expected_elements: result.details.matches_expected_elements ?? [],
      missing_expected_elements: result.details.missing_expected_elements ?? [],
    };

    if (result.details.errors) {
      currentOutput.errors = result.details.errors;
    }

    const snapshot = buildSnapshot(result.fixture_id, result.mode, currentOutput);
    saveSnapshot(goldenDir, snapshot);
    count++;
  }
  return count;
}
