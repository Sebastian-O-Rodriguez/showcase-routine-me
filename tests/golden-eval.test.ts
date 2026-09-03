import { describe, it, expect } from "vitest";
import {
  loadClassifierGolden,
  loadEstimatorGolden,
  computeClassifierStats,
  computeEstimatorStats,
  type ClassifierRunResult,
  type EstimatorRunResult,
} from "../src/eval/scoring";
import {
  referenceClassify,
  referenceEstimate,
} from "../src/eval/reference-model";

/**
 * Golden eval harness — keyless demo run.
 *
 * Runs the deterministic reference baseline against the golden fixtures and
 * scores it against the regression floors. In production this same harness
 * runs the real model (requires an API key); here the baseline stands in so
 * the whole loop — load → run → score → floor-check — executes with no key.
 */

const CLASSIFIER_ACCURACY_FLOOR = 0.7;
const ESTIMATOR_COVERAGE_FLOOR = 0.8;
const ESTIMATOR_UNKNOWN_BOUNDS_FLOOR = 0.6;

describe("golden eval: classifier accuracy vs floor", () => {
  it("scores the classifier against golden cases and clears the 0.7 floor", () => {
    const golden = loadClassifierGolden();
    const runs: ClassifierRunResult[] = golden.map((c) => {
      const out = referenceClassify(c.input);
      return {
        input: c.input,
        expectedScenario: c.expectedScenario,
        actualScenario: out.scenario,
        confidence: out.confidence,
      };
    });
    const stats = computeClassifierStats(runs);
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          step: "classifier",
          floor: CLASSIFIER_ACCURACY_FLOOR,
          ...stats,
        },
        null,
        2,
      ),
    );
    expect(stats.accuracy).toBeGreaterThanOrEqual(CLASSIFIER_ACCURACY_FLOOR);
    expect(stats.count).toBeGreaterThan(0);
  });
});

describe("golden eval: estimator coverage + unknown-bounds vs floors", () => {
  it("covers all items and respects known/unknown bounds, clearing floors", () => {
    const golden = loadEstimatorGolden();
    const runs: EstimatorRunResult[] = golden.map((c) => {
      const entries = referenceEstimate(c.items, c.priorFoods);
      const unknownCount = entries.filter((e) => e.unknown).length;
      return {
        items: c.items,
        unknownAtLeast: c.unknownAtLeast,
        unknownAtMost: c.unknownAtMost,
        entries,
        allItemsCovered: entries.length === c.items.length,
        unknownInBounds:
          unknownCount >= c.unknownAtLeast && unknownCount <= c.unknownAtMost,
      };
    });
    const stats = computeEstimatorStats(runs);
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          step: "estimator",
          coverageFloor: ESTIMATOR_COVERAGE_FLOOR,
          unknownBoundsFloor: ESTIMATOR_UNKNOWN_BOUNDS_FLOOR,
          ...stats,
        },
        null,
        2,
      ),
    );
    expect(stats.coverageRate).toBeGreaterThanOrEqual(ESTIMATOR_COVERAGE_FLOOR);
    expect(stats.unknownBoundsRate).toBeGreaterThanOrEqual(
      ESTIMATOR_UNKNOWN_BOUNDS_FLOOR,
    );
  });
});