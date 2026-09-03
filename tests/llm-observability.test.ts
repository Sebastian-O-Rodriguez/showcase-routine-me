import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  estimateCostUsd,
  summarizeAiHealth,
  setAiCallSink,
  recordAiCall,
  type AiCallMetrics,
} from "../src/llm-observability";

describe("estimateCostUsd", () => {
  it("returns undefined when both token counts are unknown", () => {
    expect(estimateCostUsd()).toBeUndefined();
    expect(estimateCostUsd(undefined, undefined)).toBeUndefined();
  });

  it("computes cost from $0.25/$1.25 per 1M input/output tokens", () => {
    // 1000 input + 500 output → (1000*0.25 + 500*1.25)/1e6
    expect(estimateCostUsd(1000, 500)).toBeCloseTo(0.000875, 8);
    expect(estimateCostUsd(4_000_000, 0)).toBeCloseTo(1.0, 8);
  });
});

describe("summarizeAiHealth", () => {
  it("returns a zeroed summary for no rows", () => {
    expect(summarizeAiHealth([])).toEqual({
      calls: 0,
      avgLatencyMs: 0,
      fallbackCount: 0,
      fallbackRate: 0,
      estimatedCost: 0,
      byStep: {},
    });
  });

  it("computes volume, average latency, fallback rate, cost and per-step split", () => {
    const s = summarizeAiHealth([
      {
        step: "classify",
        latency_ms: 100,
        fallback: false,
        estimated_cost_usd: 0.001,
      },
      {
        step: "classify",
        latency_ms: 300,
        fallback: true,
        estimated_cost_usd: null,
      },
      {
        step: "estimate",
        latency_ms: 200,
        fallback: false,
        estimated_cost_usd: 0.002,
      },
    ]);
    expect(s.calls).toBe(3);
    expect(s.avgLatencyMs).toBe(200);
    expect(s.fallbackCount).toBe(1);
    expect(s.fallbackRate).toBeCloseTo(0.3333, 3);
    expect(s.estimatedCost).toBeCloseTo(0.003, 6);
    expect(s.byStep.classify).toEqual({ calls: 2, fallbacks: 1 });
    expect(s.byStep.estimate).toEqual({ calls: 1, fallbacks: 0 });
  });
});

describe("recordAiCall", () => {
  let sink: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sink = vi.fn();
    setAiCallSink(sink);
  });

  it("calls the configured sink with metrics", () => {
    const metrics: AiCallMetrics = {
      step: "classify",
      userId: "u-1",
      latencyMs: 123,
      promptTokens: 1000,
      completionTokens: 500,
      estimatedCostUsd: 0.000875,
      scenario: "log_nutrition",
      fallback: false,
      model: "anthropic/claude-haiku-4.5",
    };

    recordAiCall(metrics);

    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        step: "classify",
        userId: "u-1",
        latencyMs: 123,
        promptTokens: 1000,
        completionTokens: 500,
        estimatedCostUsd: 0.000875,
        scenario: "log_nutrition",
        fallback: false,
      }),
    );
  });

  it("defaults to no-op sink (does not throw)", () => {
    // Reset to no-op
    setAiCallSink(() => { /* noop */ });
    expect(() =>
      recordAiCall({ step: "classify", latencyMs: 10, fallback: false }),
    ).not.toThrow();
  });
});