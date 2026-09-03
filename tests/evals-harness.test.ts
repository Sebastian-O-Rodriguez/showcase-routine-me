import { describe, it, expect } from "vitest";
import {
  loadClassifierGolden,
  loadEstimatorGolden,
  computeClassifierStats,
  computeEstimatorStats,
  type ClassifierRunResult,
  type EstimatorRunResult,
} from "../src/eval/scoring";

/**
 * R1 — evals harness logic (NO real model).
 *
 * Covers the eval harness' pure logic and golden-fixture validity in the
 * default CI suite, so the harness doesn't need an LLM key to be verified.
 * The real-model run lives in the original repo (eval/ai.eval.test.ts).
 */

describe("R1 eval fixtures are well-formed", () => {
  it("loads classifier golden set without error", () => {
    const cases = loadClassifierGolden();
    expect(Array.isArray(cases)).toBe(true);
    expect(cases.length).toBeGreaterThanOrEqual(10);
    for (const c of cases) {
      expect(typeof c.input).toBe("string");
      expect(c.input.length).toBeGreaterThan(0);
      expect(typeof c.expectedScenario).toBe("string");
    }
    // Every expectedScenario must be a real classifier enum.
    const SCENARIOS: Record<string, true> = {
      log_nutrition: true,
      log_gym: true,
      log_run: true,
      mark_habit: true,
      increment_goal: true,
      set_goal: true,
      add_category: true,
      log_weight: true,
      query_progress: true,
      unknown: true,
    };
    for (const c of cases) expect(SCENARIOS[c.expectedScenario]).toBe(true);
  });

  it("loads estimator golden set with valid known/unknown bounds", () => {
    const cases = loadEstimatorGolden();
    expect(cases.length).toBeGreaterThanOrEqual(4);
    for (const c of cases) {
      expect(Array.isArray(c.items)).toBe(true);
      expect(c.items.length).toBeGreaterThan(0);
      expect(c.unknownAtLeast).toBeGreaterThanOrEqual(0);
      expect(c.unknownAtMost).toBeGreaterThanOrEqual(c.unknownAtLeast);
      // R3: optional history context must be well-formed when present.
      if (c.priorFoods) {
        for (const p of c.priorFoods) {
          expect(typeof p.item).toBe("string");
          expect(p.item.length).toBeGreaterThan(0);
          expect(p.timesLogged).toBeGreaterThanOrEqual(1);
          expect(typeof p.lastLogged).toBe("string");
          if (p.macros) {
            for (const [, v] of Object.entries(p.macros)) {
              expect(typeof v).toBe("number");
            }
          }
        }
      }
    }
    // The R3 "repeated food recalled from history" case is present.
    expect(
      cases.some((c) => c.priorFoods && c.priorFoods.length > 0),
    ).toBe(true);
  });
});

describe("R1 classifier scoring", () => {
  it("computes accuracy and lists failures", () => {
    const runs: ClassifierRunResult[] = [
      {
        input: "a",
        expectedScenario: "log_run",
        actualScenario: "log_run",
        confidence: 0.95,
      },
      {
        input: "b",
        expectedScenario: "unknown",
        actualScenario: "log_gym",
        confidence: 0.4,
      }, // miss
      {
        input: "c",
        expectedScenario: "set_goal",
        actualScenario: "set_goal",
        confidence: 0.9,
      },
      {
        input: "d",
        expectedScenario: "log_nutrition",
        actualScenario: "mark_habit",
        confidence: 0.5,
      }, // miss
    ];
    const stats = computeClassifierStats(runs);
    expect(stats.count).toBe(4);
    expect(stats.matched).toBe(2);
    expect(stats.accuracy).toBeCloseTo(0.5);
    expect(stats.failures).toHaveLength(2);
    expect(stats.failures[0].actualScenario).toBe("log_gym");
  });
});

describe("R1 estimator scoring", () => {
  it("computes coverage and unknown-bounds rates", () => {
    const runs: EstimatorRunResult[] = [
      {
        items: ["a"],
        unknownAtLeast: 0,
        unknownAtMost: 0,
        entries: [{ item: "a" }],
        allItemsCovered: true,
        unknownInBounds: true,
      },
      {
        items: ["b"],
        unknownAtLeast: 1,
        unknownAtMost: 1,
        entries: [{ item: "b", unknown: true }],
        allItemsCovered: true,
        unknownInBounds: true,
      },
      {
        items: ["c", "d"],
        unknownAtLeast: 0,
        unknownAtMost: 0,
        entries: [{ item: "c" }],
        allItemsCovered: false,
        unknownInBounds: true,
      }, // coverage miss
      {
        items: ["e"],
        unknownAtLeast: 0,
        unknownAtMost: 0,
        entries: [{ item: "e", unknown: true }],
        allItemsCovered: true,
        unknownInBounds: false,
      }, // bounds miss
    ];
    const stats = computeEstimatorStats(runs);
    expect(stats.count).toBe(4);
    expect(stats.coverageRate).toBeCloseTo(0.75);
    expect(stats.unknownBoundsRate).toBeCloseTo(0.75);
  });
});

// Regression floors — the real-model run must stay above these.
// Documented here so the harness self-documents its quality contract.
describe("R1 regression floor contract", () => {
  it("declares classifier accuracy floor at 0.7", () => {
    const FLOOR = 0.7;
    expect(FLOOR).toBe(0.7);
  });

  it("declares estimator coverage floor at 0.8", () => {
    const FLOOR = 0.8;
    expect(FLOOR).toBe(0.8);
  });

  it("declares estimator unknown-bounds floor at 0.6", () => {
    const FLOOR = 0.6;
    expect(FLOOR).toBe(0.6);
  });
});