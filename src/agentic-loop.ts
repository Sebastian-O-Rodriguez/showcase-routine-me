import { z } from "zod";
import { recordAiCall, estimateCostUsd } from "./llm-observability";
import { AGENTIC_LOOP_SYSTEM_PROMPT } from "./chat-prompt";
import { ActionPayload } from "./types";
import type { Action, ActionResult, ActionPayload as ActionPayloadType } from "./types";

/**
 * Bounded agentic loop on top of the typed Action executor.
 *
 * After a confirmed action executes, calls the model to propose the next
 * action based on the result. The model returns either
 * {"done":true,"reply":…} to end, or {"next":PAYLOAD} with a validated
 * ActionPayload. Bounded by MAX_AGENTIC_DEPTH and gated by a Zod union so a
 * malformed next-step fails closed (returns null, loop ends).
 *
 * Public Showcase Scope: real code. Deep guard + Zod gating are the
 * unit-tested core; the model client is injected (real client needs an API
 * key — out of scope).
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface AgenticStep {
  action: Action;
  result: ActionResult;
}

export const MAX_AGENTIC_DEPTH = 3;

// ---------------------------------------------------------------------------
// Response schema — model returns one of two shapes
// ---------------------------------------------------------------------------

export const AgenticResponseSchema = z.union([
  z.object({ done: z.literal(true), reply: z.string() }),
  z.object({ next: ActionPayload }),
]);

export type AgenticResponse = z.infer<typeof AgenticResponseSchema>;

// ---------------------------------------------------------------------------
// Model client boundary
// ---------------------------------------------------------------------------

export interface AgenticClient {
  complete(system: string, maxTokens: number): Promise<{
    content: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  }>;
}

// ---------------------------------------------------------------------------
// Propose next action
// ---------------------------------------------------------------------------

/**
 * Build the agentic loop system prompt from completed steps (pure).
 */
export function buildAgenticSystemPrompt(steps: AgenticStep[]): string {
  const contextLines = steps.map(
    (s, i) => `Step ${i + 1}: executed "${s.action.intent}" → ${s.result.message}`,
  );
  return [AGENTIC_LOOP_SYSTEM_PROMPT, "", "## Completed steps", ...contextLines].join(
    "\n",
  );
}

/**
 * Validate and normalize a raw model response into a next action or null.
 * Returns null for "done"/malformed output — the loop then ends.
 */
export function parseAgenticResponse(raw: string): ActionPayloadType | null {
  const cleaned = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }

  const validated = AgenticResponseSchema.safeParse(parsed);
  if (!validated.success) return null;

  if ("done" in validated.data) return null;
  return validated.data.next;
}

/**
 * Call the LLM to propose ONE follow-up action after a step completes.
 * Returns a validated ActionPayload — or null (loop ends or parse failure).
 */
export async function proposeNextAction(
  params: {
    steps: AgenticStep[];
    userId: string;
  },
  client: AgenticClient,
): Promise<ActionPayloadType | null> {
  const { steps, userId } = params;

  if (steps.length >= MAX_AGENTIC_DEPTH) return null;

  const systemMsg = buildAgenticSystemPrompt(steps);
  const startedAt = Date.now();

  const fail = (errorCode: string): null => {
    recordAiCall({
      step: "classify",
      userId,
      latencyMs: Date.now() - startedAt,
      fallback: true,
      errorCode,
    });
    return null;
  };

  try {
    const response = await client.complete(systemMsg, 512);
    const raw = response.content ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(
        raw
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```\s*$/i, "")
          .trim(),
      );
    } catch {
      console.error("[agentic-loop] JSON parse failed:", raw);
      return fail("agentic_json_parse");
    }

    const validated = AgenticResponseSchema.safeParse(parsed);
    if (!validated.success) {
      console.error("[agentic-loop] schema validation failed:", validated.error.issues);
      return fail("agentic_schema");
    }

    recordAiCall({
      step: "classify",
      userId,
      latencyMs: Date.now() - startedAt,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      estimatedCostUsd: estimateCostUsd(
        response.usage?.prompt_tokens,
        response.usage?.completion_tokens,
      ),
      fallback: false,
    });

    if ("done" in validated.data) return null;
    return validated.data.next;
  } catch (err) {
    console.error("[agentic-loop] proposeNext failed:", err);
    return fail("agentic_error");
  }
}