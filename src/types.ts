import { z } from "zod";

/**
 * Canonical Action payload types and Zod schemas for the chat action system.
 *
 * An Action is the unit of work between the chat pipeline and script
 * execution. Pipeline: classify -> normalize -> Action -> propose/execute.
 *
 * Public Showcase Scope: real code, de-identified. The mutation/execution
 * layer (server scripts + storage) is out of scope for this showcase.
 */

// ---------------------------------------------------------------------------
// Intent enum — all executable intents in the system
// ---------------------------------------------------------------------------

export const ActionIntent = z.enum([
  "log_nutrition",
  "log_gym",
  "log_run",
  "mark_habit",
  "increment_goal",
  "set_goal",
  "update_goal",
  "add_category",
  "log_weight",
  "query_progress",
  "unknown",
]);

export type ActionIntent = z.infer<typeof ActionIntent>;

// ---------------------------------------------------------------------------
// Per-intent payload schemas
// ---------------------------------------------------------------------------

export const LogNutritionPayload = z.object({
  intent: z.literal("log_nutrition"),
  entries: z.array(
    z.object({
      item: z.string(),
      calories: z.number(),
      protein: z.number(),
      fat: z.number(),
      carbs: z.number(),
      unknown: z.boolean().optional(),
    }),
  ),
});

export const LogGymPayload = z.object({
  intent: z.literal("log_gym"),
  bodyPart: z.string().optional(),
  notes: z.string().optional(),
});

export const LogRunPayload = z.object({
  intent: z.literal("log_run"),
  miles: z.number(),
  duration: z.string().optional(),
  notes: z.string().optional(),
});

export const MarkHabitPayload = z.object({
  intent: z.literal("mark_habit"),
  habit: z.string(),
});

export const IncrementGoalPayload = z.object({
  intent: z.literal("increment_goal"),
  habit: z.string(),
  value: z.number(),
  unit: z.string(),
});

export const SetGoalPayload = z.object({
  intent: z.literal("set_goal"),
  categoryName: z.string(),
  metric: z.string(),
  target: z.number(),
  unit: z.string().optional(),
  period: z.enum(["daily", "weekly"]),
});

export const UpdateGoalPayload = z.object({
  intent: z.literal("update_goal"),
  categoryName: z.string(),
  metric: z.string(),
  target: z.number(),
  unit: z.string().optional(),
  period: z.enum(["daily", "weekly"]),
});

export const AddCategoryPayload = z.object({
  intent: z.literal("add_category"),
  name: z.string(),
  type: z.enum(["gym", "nutrition", "running", "custom"]).optional(),
});

export const WeightLogPayload = z.object({
  intent: z.literal("log_weight"),
  value: z.number(),
  unit: z.string().optional(),
});

export const QueryProgressPayload = z.object({
  intent: z.literal("query_progress"),
  timeframe: z.enum(["today", "week", "month"]).default("today"),
  category: z.string().optional(),
});

export const UnknownPayload = z.object({
  intent: z.literal("unknown"),
});

/**
 * Discriminated union of all action payloads, keyed by `intent`.
 * This is the Zod gate the agentic loop uses to validate model output.
 */
export const ActionPayload = z.discriminatedUnion("intent", [
  LogNutritionPayload,
  LogGymPayload,
  LogRunPayload,
  MarkHabitPayload,
  IncrementGoalPayload,
  SetGoalPayload,
  UpdateGoalPayload,
  AddCategoryPayload,
  WeightLogPayload,
  QueryProgressPayload,
  UnknownPayload,
]);

export type ActionPayload = z.infer<typeof ActionPayload>;

// ---------------------------------------------------------------------------
// Action — the canonical unit of work
// ---------------------------------------------------------------------------

export const ActionSchema = z.object({
  /** Unique action ID (client-generated UUID). */
  id: z.string().uuid(),

  /** Which intent this action represents. */
  intent: ActionIntent,

  /** Authenticated user ID — always server-set, never trust client. */
  userId: z.string(),

  /** Resolved category context. */
  categoryId: z.string().nullable().optional(),
  categoryName: z.string().nullable().optional(),

  /** The typed payload for this intent. */
  payload: ActionPayload,

  /** Action lifecycle status. */
  status: z.enum(["proposed", "confirmed", "executed", "cancelled", "error"]),

  /** Confidence score from classifier (0-1). */
  confidence: z.number().min(0).max(1),

  /** ISO timestamp of creation. */
  createdAt: z.string().datetime(),

  /** Mutation type after execution (null until executed). */
  mutation: z.string().nullable().optional(),
});

export type Action = z.infer<typeof ActionSchema>;

// ---------------------------------------------------------------------------
// Action result — what comes back after execution
// ---------------------------------------------------------------------------

export const ActionResultSchema = z.object({
  actionId: z.string().uuid(),
  success: z.boolean(),
  message: z.string(),
  status: z.enum(["proposed", "executed", "info", "error", "clarify"]),
  mutation: z.string().nullable().optional(),
  data: z.unknown().optional(),
  timestamp: z.number(),
});

export type ActionResult = z.infer<typeof ActionResultSchema>;