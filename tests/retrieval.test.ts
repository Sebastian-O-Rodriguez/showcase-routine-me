import { describe, it, expect } from "vitest";
import { buildEstimatorUserContent } from "../src/chat-estimator";
import {
  rankPriorNutrition,
  retrievePriorNutrition,
  type PriorNutritionSource,
} from "../src/retrieval";

/**
 * R3 — retrieval + prompt grounding (no real model/network).
 */

describe("R3 buildEstimatorUserContent", () => {
  it("emits the items line alone when no history is provided", () => {
    const content = buildEstimatorUserContent(["2 eggs", "toast"], undefined);
    expect(content).toContain(`Food items to estimate: ["2 eggs","toast"]`);
    expect(content).not.toContain("previously logged");
  });

  it("injects prior foods and the grounding instruction when history exists", () => {
    const content = buildEstimatorUserContent(["breakfast bowl"], [
      {
        item: "breakfast bowl",
        timesLogged: 6,
        lastLogged: "2026-08-10",
        macros: { calories: 420, protein: 24, fat: 18, carbs: 40 },
      },
    ]);

    expect(content).toContain("## User's previously logged foods");
    expect(content).toContain(
      "- breakfast bowl (logged 6 times, last 2026-08-10) — ~420 cal, ~24g protein, ~18g fat, ~40g carbs",
    );
    expect(content).toContain(
      "reuse that previously logged food's macros verbatim",
    );
  });

  it("formats singular count correctly", () => {
    const content = buildEstimatorUserContent(["toast"], [
      { item: "toast", timesLogged: 1, lastLogged: "2026-08-11" },
    ]);
    expect(content).toContain("- toast (logged 1 time, last 2026-08-11)");
  });
});

describe("R3 rankPriorNutrition", () => {
  it("ranks repeated recent foods by frequency then recency, deduped by casing", () => {
    const result = rankPriorNutrition([
      {
        item: "breakfast bowl",
        calories: 420,
        protein: 24,
        fat: 18,
        carbs: 40,
        date: "2026-08-10",
      },
      {
        item: "Breakfast Bowl",
        calories: 415,
        protein: 23,
        fat: 18,
        carbs: 41,
        date: "2026-08-09",
      },
      {
        item: "toast",
        calories: 80,
        protein: 3,
        fat: 1,
        carbs: 15,
        date: "2026-08-08",
      },
      { source: "confirmed", date: "2026-08-07" }, // no item → skipped
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      item: "breakfast bowl",
      timesLogged: 2,
      lastLogged: "2026-08-10",
      macros: { calories: 420, protein: 24, fat: 18, carbs: 40 },
    });
    expect(result[1]).toMatchObject({
      item: "toast",
      timesLogged: 1,
      lastLogged: "2026-08-08",
    });
  });

  it("returns empty for rows with no item string", () => {
    expect(rankPriorNutrition([{ source: "confirmed" }])).toHaveLength(0);
  });
});

describe("R3 retrievePriorNutrition", () => {
  it("returns empty when the source has no rows", async () => {
    const source: PriorNutritionSource = {
      fetchRecentNutritionLogs: async () => [],
    };
    const result = await retrievePriorNutrition("user-1", source);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it("ranks repeated recent foods from the source", async () => {
    const source: PriorNutritionSource = {
      fetchRecentNutritionLogs: async () => [
        {
          item: "breakfast bowl",
          calories: 420,
          protein: 24,
          fat: 18,
          carbs: 40,
          date: "2026-08-10",
        },
        { item: "toast", calories: 80, protein: 3, fat: 1, carbs: 15, date: "2026-08-08" },
      ],
    };
    const result = await retrievePriorNutrition("user-1", source);
    expect(result).toHaveLength(2);
    expect(result[0].item).toBe("breakfast bowl");
  });

  it("degrades to empty instead of throwing on a source error", async () => {
    const source: PriorNutritionSource = {
      fetchRecentNutritionLogs: async () => {
        throw new Error("connection refused");
      },
    };
    const result = await retrievePriorNutrition("user-1", source);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});