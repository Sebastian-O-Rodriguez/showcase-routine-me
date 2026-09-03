import { z } from "zod";
import {
  estimatedNutritionEntrySchema,
  type EstimatedNutritionEntry,
} from "./chat-scenarios";
import { ESTIMATOR_PROMPT } from "./chat-prompt";
import { recordAiCall, estimateCostUsd } from "./llm-observability";
import type { PriorFood } from "./retrieval";

/**
 * Nutrition estimator — the second LLM step (separate from classification).
 *
 * The classifier only extracts item names; this estimator provides macro
 * estimates. Unknown foods get `{ unknown: true }` with zeroed macros — it
 * NEVER fabricates numbers for foods it doesn't recognize.
 *
 * Public Showcase Scope: real code. The model client is injected so the pure
 * prompt-building and proposal-formatting logic are unit-tested keylessly;
 * the real client (requires an API key) is out of scope.
 */

const estimatorResponseSchema = z.array(estimatedNutritionEntrySchema);

export interface EstimateOptions {
  /** Authenticated user id, attached to the AI-call log row. */
  userId?: string;
  /**
   * Foods this user has logged before, retrieved from their history.
   * When an item to estimate matches (or is very similar to) one of these,
   * the estimator reuses that logged portion instead of a generic estimate.
   */
  priorFoods?: PriorFood[];
}

/** Minimal model-client boundary — the real client performs an LLM chat call. */
export interface EstimatorClient {
  complete(system: string, user: string, maxTokens: number): Promise<{
    content: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  }>;
}

/** Fallback shape when the estimator cannot produce a usable answer. */
export function allUnknown(items: string[]): EstimatedNutritionEntry[] {
  return items.map((item) => ({
    item,
    calories: 0,
    protein: 0,
    fat: 0,
    carbs: 0,
    unknown: true,
  }));
}

/** Build the estimator user message, grounding it in the user's own history. */
export function buildEstimatorUserContent(
  items: string[],
  priorFoods: PriorFood[] | undefined,
): string {
  const lines = [`Food items to estimate: ${JSON.stringify(items)}`];

  if (priorFoods && priorFoods.length > 0) {
    const history = priorFoods
      .map((p) => {
        const when = `${p.item} (logged ${p.timesLogged} time${
          p.timesLogged === 1 ? "" : "s"
        }, last ${p.lastLogged})`;
        const m = p.macros;
        if (!m) return `- ${when}`;
        const parts: string[] = [];
        if (m.calories !== undefined) parts.push(`~${m.calories} cal`);
        if (m.protein !== undefined) parts.push(`~${m.protein}g protein`);
        if (m.fat !== undefined) parts.push(`~${m.fat}g fat`);
        if (m.carbs !== undefined) parts.push(`~${m.carbs}g carbs`);
        return `- ${when} — ${parts.join(", ")}`;
      })
      .join("\n");

    lines.push(
      "",
      "## User's previously logged foods",
      history,
      "",
      "If an item above matches or is very similar to one in this history, " +
        "reuse that previously logged food's macros verbatim instead of a generic estimate.",
    );
  }

  return lines.join("\n");
}

/**
 * Estimate nutrition macros for a list of food items.
 *
 * All returned values are tagged as estimated. Unknown foods get
 * `{ unknown: true }` with zeroed macros. Each call is recorded via
 * llm-observability (fire-and-forget). On ANY failure it fails closed to
 * all-unknown — it never invents macros.
 */
export async function estimateNutrition(
  items: string[],
  client: EstimatorClient,
  options?: EstimateOptions,
): Promise<EstimatedNutritionEntry[]> {
  if (items.length === 0) return [];

  const startedAt = Date.now();
  const fail = (errorCode: string): EstimatedNutritionEntry[] => {
    recordAiCall({
      step: "estimate",
      userId: options?.userId,
      latencyMs: Date.now() - startedAt,
      fallback: true,
      errorCode,
    });
    return allUnknown(items);
  };

  try {
    const response = await client.complete(
      ESTIMATOR_PROMPT,
      buildEstimatorUserContent(items, options?.priorFoods),
      512,
    );

    const raw = response.content ?? "";

    // Strip markdown code fences if present
    const cleaned = raw
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error("[estimateNutrition] JSON parse failed:", cleaned);
      return fail("json_parse");
    }

    const result = estimatorResponseSchema.safeParse(parsed);
    if (!result.success) {
      console.error(
        "[estimateNutrition] Schema validation failed:",
        result.error.issues,
      );
      return fail("schema_validation");
    }

    recordAiCall({
      step: "estimate",
      userId: options?.userId,
      latencyMs: Date.now() - startedAt,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      estimatedCostUsd: estimateCostUsd(
        response.usage?.prompt_tokens,
        response.usage?.completion_tokens,
      ),
      fallback: false,
    });
    return result.data;
  } catch (err) {
    console.error("[estimateNutrition] LLM call failed:", err);
    return fail("llm_error");
  }
}

/**
 * Format estimated nutrition entries into a human-readable proposal string.
 * Uses ~ prefix to indicate estimates. Asks for confirmation.
 */
export function formatNutritionProposal(
  entries: EstimatedNutritionEntry[],
): string {
  const unknowns = entries.filter((e) => e.unknown);
  const known = entries.filter((e) => !e.unknown);

  const lines: string[] = [];

  for (const entry of known) {
    lines.push(
      `${entry.item} — ~${entry.calories} cal, ~${entry.protein}g protein, ~${entry.fat}g fat, ~${entry.carbs}g carbs`,
    );
  }

  if (unknowns.length > 0) {
    const unknownNames = unknowns.map((e) => e.item).join(", ");
    lines.push(
      `I'm not sure about ${unknownNames} — can you give me the rough macros?`,
    );
  }

  if (known.length > 0) {
    const totalCal = known.reduce((s, e) => s + e.calories, 0);
    lines.push(`Total: ~${totalCal} cal (estimated). Want me to log that?`);
  }

  return lines.join("\n");
}