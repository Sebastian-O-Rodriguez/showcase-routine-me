import type { ClassifierOutput } from "../chat-scenarios";
import type { EstimatedNutritionEntry } from "../chat-scenarios";
import type { PriorFood } from "../retrieval";

/**
 * Deterministic reference baseline — a stand-in for the LLM "model under
 * test" so the golden eval harness can run fully keyless.
 *
 * This is NOT the production model (the real classifier/estimator require an
 * API key and live in the original repo under `npm run evals`). It is a
 * keyword/table baseline that exercises the harness end-to-end: load golden
 * fixtures → run model → score → compare against regression floors.
 *
 * Public Showcase Scope: reconstructed (baseline stand-in), clearly labeled.
 */

// ---------------------------------------------------------------------------
// Reference classifier (keyword rules)
// ---------------------------------------------------------------------------

const CLASSIFIER_RULES: Array<{ scenario: string; test: (s: string) => boolean }> = [
  {
    scenario: "increment_goal",
    test: (s) => /\bincrease\b|\badd\s+\d|\bby\s+\d/.test(s) && /\bgoal\b|\bpush-up\b/.test(s),
  },
  {
    scenario: "set_goal",
    test: (s) => /\bset\b.*\bgoal\b|\bgoal\s+to\b/.test(s),
  },
  {
    scenario: "add_category",
    test: (s) => /\badd\b.*\bcategor/.test(s),
  },
  {
    scenario: "log_weight",
    test: (s) => /\bweigh(ed|s|ing)?\b|\bweight\b|\bkg\b|\blbs\b/.test(s),
  },
  {
    scenario: "query_progress",
    test: (s) => /\bhow (did|am)\b|\bprogress\b|\bshow\b.*\b(progress|week|month)\b/.test(s),
  },
  {
    scenario: "mark_habit",
    test: (s) => /\bmark\b.*\bdone\b|\bdone\b|\bcompleted\b/.test(s),
  },
  {
    scenario: "log_run",
    test: (s) => /\bran\b|\brun\b|\b5k\b|\bmiles\b|\bjog/.test(s),
  },
  {
    scenario: "log_gym",
    test: (s) => /\bgym\b|\bworkout\b|\bchest\b|\btriceps\b|\bleg day\b|\blift/.test(s),
  },
  {
    scenario: "log_nutrition",
    test: (s) => /\bate\b|\beat\b|\blunch\b|\bbreakfast\b|\bdinner\b|\beggs\b|\btoast\b|\bcheeseburger\b|\bfood\b/.test(s),
  },
];

export function referenceClassify(input: string): ClassifierOutput {
  const s = input.toLowerCase();
  for (const rule of CLASSIFIER_RULES) {
    if (rule.test(s)) {
      return { scenario: rule.scenario, params: {}, confidence: 0.9 };
    }
  }
  return { scenario: "unknown", params: {}, confidence: 0.9 };
}

// ---------------------------------------------------------------------------
// Reference estimator (known-foods table + unknown fallback)
// ---------------------------------------------------------------------------

const KNOWN_FOODS: Record<string, Omit<EstimatedNutritionEntry, "item">> = {
  "2 eggs": { calories: 140, protein: 12, fat: 10, carbs: 1 },
  "1 slice of toast": { calories: 80, protein: 3, fat: 1, carbs: 15 },
  cheeseburger: { calories: 530, protein: 25, fat: 30, carbs: 40 },
  "grilled chicken breast": { calories: 280, protein: 50, fat: 6, carbs: 0 },
  rice: { calories: 205, protein: 4, fat: 0, carbs: 45 },
  "protein shake": { calories: 120, protein: 24, fat: 1, carbs: 3 },
  "breakfast bowl": { calories: 420, protein: 24, fat: 18, carbs: 40 },
};

export function referenceEstimate(
  items: string[],
  priorFoods?: PriorFood[],
): EstimatedNutritionEntry[] {
  return items.map((item) => {
    const prior = priorFoods?.find((p) => p.item.toLowerCase() === item.toLowerCase());
    if (prior?.macros) {
      return {
        item,
        calories: prior.macros.calories ?? 0,
        protein: prior.macros.protein ?? 0,
        fat: prior.macros.fat ?? 0,
        carbs: prior.macros.carbs ?? 0,
      };
    }
    const known = KNOWN_FOODS[item];
    if (known) return { item, ...known };
    // Honest unknown — never fabricate.
    return { item, calories: 0, protein: 0, fat: 0, carbs: 0, unknown: true };
  });
}