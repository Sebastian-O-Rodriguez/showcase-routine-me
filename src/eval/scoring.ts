/**
 * Shared eval scoring helpers — pure, deterministic, unit-testable.
 *
 * The real-model eval (eval/ai.eval.test.ts in the original repo) is a thin
 * shell around these; the default Vitest suite covers them with synthetic
 * runs so the harness logic and fixture validity are verified without an
 * LLM key.
 *
 * Public Showcase Scope: real code, sanitized (no project identifiers).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// ---------------------------------------------------------------------------
// Fixture shapes
// ---------------------------------------------------------------------------

/** A single classifier golden case. */
export interface ClassifierGoldenCase {
  /** The user message to classify. */
  input: string;
  /** The scenario the model MUST return (from classifierOutputSchema enums). */
  expectedScenario: string;
}

/** A single estimator golden case. */
export interface EstimatorGoldenCase {
  /** Food items to estimate. */
  items: string[];
  /**
   * Optional user history context. When set, verifies the model grounds an
   * otherwise-unknown/repeated item in the user's prior logs (R3 RAG).
   */
  priorFoods?: Array<{
    item: string;
    timesLogged: number;
    lastLogged: string;
    macros?: {
      calories?: number;
      protein?: number;
      fat?: number;
      carbs?: number;
    };
  }>;
  /** Minimum number of entries that must be tagged unknown (honest-fallback check). */
  unknownAtLeast: number;
  /** Maximum number of entries allowed to be tagged unknown (known-coverage check). */
  unknownAtMost: number;
}

// ---------------------------------------------------------------------------
// Fixture loading + validation
// ---------------------------------------------------------------------------

function loadJson<T>(name: string): T[] {
  const path = join(__dirname, name);
  const raw: unknown = JSON.parse(readFileSync(path, "utf-8"));
  if (!Array.isArray(raw))
    throw new Error(`${name}: fixture must be an array`);
  return raw as T[];
}

export function loadClassifierGolden(): ClassifierGoldenCase[] {
  const cases = loadJson<ClassifierGoldenCase>("golden-classifier.json");
  for (const c of cases) {
    if (typeof c.input !== "string" || c.input.length === 0)
      throw new Error("golden-classifier.json: case missing non-empty input");
    if (
      typeof c.expectedScenario !== "string" ||
      c.expectedScenario.length === 0
    )
      throw new Error("golden-classifier.json: case missing expectedScenario");
  }
  return cases;
}

export function loadEstimatorGolden(): EstimatorGoldenCase[] {
  const cases = loadJson<EstimatorGoldenCase>("golden-estimator.json");
  for (const c of cases) {
    if (!Array.isArray(c.items) || c.items.length === 0)
      throw new Error("golden-estimator.json: case missing items");
    if (
      typeof c.unknownAtLeast !== "number" ||
      typeof c.unknownAtMost !== "number"
    )
      throw new Error("golden-estimator.json: case missing unknown bounds");
    if (c.unknownAtLeast < 0 || c.unknownAtMost < c.unknownAtLeast)
      throw new Error("golden-estimator.json: invalid unknown bounds");
  }
  return cases;
}

// ---------------------------------------------------------------------------
// Classifier scoring
// ---------------------------------------------------------------------------

export interface ClassifierRunResult {
  input: string;
  expectedScenario: string;
  actualScenario: string;
  confidence: number;
}

export interface ClassifierStats {
  count: number;
  matched: number;
  accuracy: number;
  failures: ClassifierRunResult[];
}

export function computeClassifierStats(
  runs: ClassifierRunResult[],
): ClassifierStats {
  const failures = runs.filter((r) => r.actualScenario !== r.expectedScenario);
  return {
    count: runs.length,
    matched: runs.length - failures.length,
    accuracy:
      runs.length === 0
        ? 0
        : (runs.length - failures.length) / runs.length,
    failures,
  };
}

// ---------------------------------------------------------------------------
// Estimator scoring
// ---------------------------------------------------------------------------

export interface EstimatedEntry {
  item: string;
  unknown?: boolean;
}

export interface EstimatorRunResult {
  items: string[];
  unknownAtLeast: number;
  unknownAtMost: number;
  entries: EstimatedEntry[];
  /** true if all provided items were resolved to an entry (coverage). */
  allItemsCovered: boolean;
  /** true if the observed uncertain count falls within [unknownAtLeast, unknownAtMost]. */
  unknownInBounds: boolean;
}

export interface EstimatorStats {
  count: number;
  coverageOk: number;
  unknownInBoundsOk: number;
  coverageRate: number;
  unknownBoundsRate: number;
  report: EstimatorRunResult[];
}

export function computeEstimatorStats(
  runs: EstimatorRunResult[],
): EstimatorStats {
  const coverageOk = runs.filter((r) => r.allItemsCovered).length;
  const unknownInBoundsOk = runs.filter((r) => r.unknownInBounds).length;
  return {
    count: runs.length,
    coverageOk,
    unknownInBoundsOk,
    coverageRate: runs.length === 0 ? 0 : coverageOk / runs.length,
    unknownBoundsRate: runs.length === 0 ? 0 : unknownInBoundsOk / runs.length,
    report: runs,
  };
}