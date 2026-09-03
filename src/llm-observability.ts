/**
 * AI observability — per-LLM-call metrics.
 *
 * Records latency, token counts, estimated cost, step, and outcome. The
 * persistence boundary is injected (a no-op by default), preserving the
 * fire-and-forget guarantee: observability must NEVER add latency to or break
 * the request path.
 *
 * Public Showcase Scope: real code, reconstructed at the persistence boundary.
 * In production the sink writes to a `ai_call_logs` table via a service-role
 * client that fails closed when its key is absent. That table + its RLS
 * policy are OMITTED here (private infra) — see docs/architecture.md.
 */

/** Which LLM step produced the call. */
export type AiStep = "classify" | "estimate";

export interface AiCallMetrics {
  step: AiStep;
  userId?: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  estimatedCostUsd?: number;
  scenario?: string;
  fallback: boolean;
  errorCode?: string;
  model?: string;
}

/**
 * Approximate claude-haiku-4.5 pricing, USD per 1M tokens [INFERENCE — model
 * pricing changes; capture for trend visibility, not billing-grade accuracy].
 */
export const PRICE_PER_1M_TOKENS = { input: 0.25, output: 1.25 };

/** Derive an approximate USD cost from token counts; undefined if both unknown. */
export function estimateCostUsd(
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  if (promptTokens == null && completionTokens == null) return undefined;
  const input = (promptTokens ?? 0) * PRICE_PER_1M_TOKENS.input;
  const output = (completionTokens ?? 0) * PRICE_PER_1M_TOKENS.output;
  return (input + output) / 1_000_000;
}

// ---------------------------------------------------------------------------
// Persistence boundary (injected — see note at top)
// ---------------------------------------------------------------------------

/** Sink that persists one call's metrics. May be async; errors are swallowed. */
export type AiCallSink = (metrics: AiCallMetrics) => void | Promise<void>;

/** No-op sink — tests / local without a configured backend. */
const noopSink: AiCallSink = () => {};

let activeSink: AiCallSink = noopSink;

/** Swap the persistence sink (once, at startup, in production wiring). */
export function setAiCallSink(sink: AiCallSink): void {
  activeSink = sink;
}

/**
 * Persist one AI call's metrics. Fire-and-forget: callers do NOT await this
 * before continuing (it returns void). Never throws on failure.
 */
export function recordAiCall(metrics: AiCallMetrics): void {
  try {
    void activeSink(metrics);
  } catch (err) {
    console.error("[llm-observability] recordAiCall failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Health aggregation (pure — unit-tested)
// ---------------------------------------------------------------------------

/** One raw row from the ai_call_logs table. */
export interface AiCallLogRow {
  step: string;
  latency_ms: number;
  fallback: boolean;
  estimated_cost_usd: number | null;
}

export interface StepBreakdown {
  calls: number;
  fallbacks: number;
}

export interface AiHealthSummary {
  calls: number;
  avgLatencyMs: number;
  fallbackCount: number;
  fallbackRate: number;
  estimatedCost: number;
  byStep: Record<string, StepBreakdown>;
}

/** Aggregate rows into a health summary. */
export function summarizeAiHealth(rows: AiCallLogRow[]): AiHealthSummary {
  const calls = rows.length;
  const avgLatencyMs =
    calls === 0 ? 0 : rows.reduce((s, r) => s + r.latency_ms, 0) / calls;
  const fallbackCount = rows.filter((r) => r.fallback).length;
  const byStep: Record<string, StepBreakdown> = {};
  for (const r of rows) {
    const b = (byStep[r.step] ??= { calls: 0, fallbacks: 0 });
    b.calls += 1;
    if (r.fallback) b.fallbacks += 1;
  }
  return {
    calls,
    avgLatencyMs: Number(avgLatencyMs.toFixed(1)),
    fallbackCount,
    fallbackRate: calls === 0 ? 0 : Number((fallbackCount / calls).toFixed(4)),
    estimatedCost: Number(
      rows.reduce((s, r) => s + (r.estimated_cost_usd ?? 0), 0).toFixed(4),
    ),
    byStep,
  };
}