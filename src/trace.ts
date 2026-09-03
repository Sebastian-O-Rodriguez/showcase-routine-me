/**
 * Per-request action trace observability.
 *
 * Fire-and-forget recording: every chat request writes one trace capturing
 * input → intent → action → status → latency. Never throws; failures are
 * logged and swallowed. The persistence boundary is injected (no-op default).
 *
 * Public Showcase Scope: real code, reconstructed at the persistence boundary.
 * In production the sink writes to an `action_traces` table (OMITTED here).
 */

export type TraceStatus =
  | "proposed"
  | "executed"
  | "info"
  | "error"
  | "clarify";

export interface TraceEntry {
  userId: string;
  input: string;
  intent?: string;
  /** Serialisable action payload. */
  action?: Record<string, unknown>;
  status: TraceStatus;
  errorCode?: string;
  latencyMs: number;
}

/** Sink that persists one trace. May be async; errors are swallowed. */
export type TraceSink = (entry: TraceEntry) => void | Promise<void>;

const noopSink: TraceSink = () => {};

let activeSink: TraceSink = noopSink;

/** Swap the persistence sink (once, at startup, in production wiring). */
export function setTraceSink(sink: TraceSink): void {
  activeSink = sink;
}

/**
 * Persist one chat-request trace.
 *
 * Fire-and-forget: callers MUST NOT await this (it returns void). Never
 * throws.
 */
export function recordTrace(entry: TraceEntry): void {
  try {
    void activeSink(entry);
  } catch (err) {
    console.error("[trace] recordTrace failed:", err);
  }
}