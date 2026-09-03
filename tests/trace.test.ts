import { describe, it, expect, vi, beforeEach } from "vitest";
import { recordTrace, setTraceSink, type TraceEntry } from "../src/trace";

describe("recordTrace", () => {
  let sink: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sink = vi.fn();
    setTraceSink(sink);
  });

  it("calls the configured sink with the trace entry", () => {
    const entry: TraceEntry = {
      userId: "u-1",
      input: "log 3 miles this morning",
      intent: "log_run",
      action: { type: "log_run", distanceKm: 4.8 },
      status: "proposed",
      latencyMs: 231.6,
    };

    recordTrace(entry);

    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-1",
        input: "log 3 miles this morning",
        intent: "log_run",
        action: { type: "log_run", distanceKm: 4.8 },
        status: "proposed",
        latencyMs: 231.6,
      }),
    );
  });

  it("passes through entry fields as provided", () => {
    recordTrace({ userId: "u-2", input: "hi", status: "info", latencyMs: 5.4 });
    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u-2",
        input: "hi",
        status: "info",
        latencyMs: 5.4,
      }),
    );
  });

  it("does not throw when the sink throws", () => {
    setTraceSink(() => {
      throw new Error("sink failure");
    });
    expect(() =>
      recordTrace({ userId: "u-3", input: "hi", status: "info", latencyMs: 1 }),
    ).not.toThrow();
  });
});