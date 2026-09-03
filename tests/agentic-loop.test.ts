import { describe, it, expect } from "vitest";
import { z } from "zod";
import { ActionPayload } from "../src/types";
import {
  MAX_AGENTIC_DEPTH,
  AgenticResponseSchema,
  buildAgenticSystemPrompt,
  parseAgenticResponse,
  proposeNextAction,
  type AgenticStep,
  type AgenticClient,
} from "../src/agentic-loop";
import { AGENTIC_LOOP_SYSTEM_PROMPT } from "../src/chat-prompt";

/**
 * R4 — agentic loop unit tests (no real model call).
 * Covers: schema parsing, prompt structure, max-depth guard.
 */

describe("R4 agentic response schema", () => {
  it("accepts a done response", () => {
    const result = AgenticResponseSchema.safeParse({
      done: true,
      reply: "All done!",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid next action (log_gym)", () => {
    const result = AgenticResponseSchema.safeParse({
      next: { intent: "log_gym", bodyPart: "chest", notes: "bench press" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid next action (query_progress)", () => {
    const result = AgenticResponseSchema.safeParse({
      next: {
        intent: "query_progress",
        timeframe: "week",
        category: "nutrition",
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid next action (log_run)", () => {
    const result = AgenticResponseSchema.safeParse({
      next: { intent: "log_run", miles: 3.5, duration: "30min" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects next action with unknown intent", () => {
    const result = AgenticResponseSchema.safeParse({
      next: { intent: "do_backflip" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects next action missing required fields (log_run without miles)", () => {
    const result = AgenticResponseSchema.safeParse({
      next: { intent: "log_run" },
    });
    expect(result.success).toBe(false);
  });
});

describe("R4 parseAgenticResponse", () => {
  it("returns a validated next action for a well-formed proposal", () => {
    const next = parseAgenticResponse(
      JSON.stringify({ next: { intent: "log_gym", bodyPart: "chest" } }),
    );
    expect(next).toEqual({ intent: "log_gym", bodyPart: "chest" });
  });

  it("returns null for a done response", () => {
    expect(parseAgenticResponse('{"done":true,"reply":"ok"}')).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseAgenticResponse("not json")).toBeNull();
  });

  it("returns null for a schema-invalid payload", () => {
    expect(
      parseAgenticResponse(JSON.stringify({ next: { intent: "do_backflip" } })),
    ).toBeNull();
  });
});

describe("R4 loop constraints", () => {
  it("returns null when steps reach max depth", async () => {
    const steps: AgenticStep[] = Array.from(
      { length: MAX_AGENTIC_DEPTH },
      (_, i) => ({
        action: {
          id: crypto.randomUUID(),
          intent: "log_gym" as const,
          userId: "user-1",
          categoryId: null,
          categoryName: null,
          payload: { intent: "log_gym" as const },
          status: "executed" as const,
          confidence: 1,
          createdAt: new Date().toISOString(),
          mutation: "gym_logged",
        },
        result: {
          actionId: crypto.randomUUID(),
          success: true,
          message: "Logged",
          status: "executed" as const,
          mutation: "gym_logged",
          timestamp: Date.now(),
        },
      }),
    );

    const client: AgenticClient = {
      complete: async () => ({ content: '{"done":true,"reply":"ok"}' }),
    };

    const result = await proposeNextAction(
      { steps, userId: "user-1" },
      client,
    );
    expect(result).toBeNull();
  });
});

describe("R4 prompt shape", () => {
  it("contains all 8 action intents plus done", () => {
    const intents = [
      "log_nutrition",
      "log_gym",
      "log_run",
      "mark_habit",
      "increment_goal",
      "set_goal",
      "add_category",
      "query_progress",
    ];
    for (const intent of intents) {
      expect(AGENTIC_LOOP_SYSTEM_PROMPT).toContain(intent);
    }
    expect(AGENTIC_LOOP_SYSTEM_PROMPT).toContain('"done"');
  });

  it("includes output format instructions", () => {
    expect(AGENTIC_LOOP_SYSTEM_PROMPT).toContain("Output format");
    expect(AGENTIC_LOOP_SYSTEM_PROMPT).toContain("PAYLOAD_OBJECT");
  });

  it("builds system prompt with completed steps context", () => {
    const steps: AgenticStep[] = [
      {
        action: {
          id: crypto.randomUUID(),
          intent: "log_gym" as const,
          userId: "u",
          payload: { intent: "log_gym" as const },
          status: "executed" as const,
          confidence: 1,
          createdAt: new Date().toISOString(),
        },
        result: {
          actionId: crypto.randomUUID(),
          success: true,
          message: "Logged gym session",
          status: "executed" as const,
          timestamp: Date.now(),
        },
      },
    ];
    const prompt = buildAgenticSystemPrompt(steps);
    expect(prompt).toContain("## Completed steps");
    expect(prompt).toContain('executed "log_gym" → Logged gym session');
  });
});