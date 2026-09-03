/**
 * Lightweight retrieval over a user's own history.
 *
 * Grounds the nutrition estimator in what THIS user has logged before, so a
 * repeated food gets its previously logged portion/macros instead of a generic
 * estimate. No vector index — a bounded recent-log scan + frequency ranking is
 * the retrieval path; an embedding store can replace the source without
 * touching the estimator.
 *
 * Public Showcase Scope: real code, reconstructed at the storage boundary. In
 * production the source runs a bounded recent-log query against a `logs` table
 * (OMITTED here — private infra). The ranking logic below is the real,
 * unit-tested core.
 */

export interface PriorFood {
  /** The item string exactly as stored on a prior nutrition log. */
  item: string;
  /** Number of times this normalized item appears across recent logs. */
  timesLogged: number;
  /** ISO date (YYYY-MM-DD) of the most recent log for this item. */
  lastLogged: string;
  /** Macros from the most recent logged occurrence, when recorded. */
  macros?: { calories?: number; protein?: number; fat?: number; carbs?: number };
}

/** A single nutrition-log row as read from storage. */
export interface NutritionLogRow {
  item?: unknown;
  calories?: unknown;
  protein?: unknown;
  fat?: unknown;
  carbs?: unknown;
  date?: string;
}

/** How many recent nutrition log rows are pulled before ranking. */
export const RECENT_LOG_SCAN = 300;

/** Max prior foods handed to the estimator. */
export const DEFAULT_LIMIT = 8;

/** Extract numeric macros from a nutrition log payload if present. */
function pickMacros(d: {
  calories?: unknown;
  protein?: unknown;
  fat?: unknown;
  carbs?: unknown;
}): PriorFood["macros"] | undefined {
  const num = (v: unknown): number | undefined =>
    typeof v === "number" ? v : undefined;
  const c = num(d.calories);
  const p = num(d.protein);
  const f = num(d.fat);
  const car = num(d.carbs);
  if (c === undefined && p === undefined && f === undefined && car === undefined) {
    return undefined;
  }
  return {
    ...(c !== undefined ? { calories: c } : {}),
    ...(p !== undefined ? { protein: p } : {}),
    ...(f !== undefined ? { fat: f } : {}),
    ...(car !== undefined ? { carbs: car } : {}),
  };
}

/**
 * Pure ranking of recent log rows into prior foods: group by normalized item
 * string, keep the most recent occurrence + casing, sort by frequency then
 * recency, and take the top `limit`.
 */
export function rankPriorNutrition(
  rows: NutritionLogRow[],
  limit: number = DEFAULT_LIMIT,
): PriorFood[] {
  const counts = new Map<
    string,
    {
      count: number;
      lastLogged: string;
      label: string;
      macros?: PriorFood["macros"];
    }
  >();

  for (const row of rows) {
    const item = typeof row.item === "string" ? row.item.trim() : "";
    if (!item) continue;

    const macros = pickMacros(row);
    const key = item.toLowerCase();
    const existing = counts.get(key);
    const date = row.date ?? "";
    if (existing) {
      existing.count += 1;
      if (date > existing.lastLogged) {
        existing.lastLogged = date;
        existing.label = item;
        if (macros) existing.macros = macros;
      }
    } else {
      counts.set(key, { count: 1, lastLogged: date, label: item, macros });
    }
  }

  return [...counts.values()]
    .sort(
      (a, b) =>
        b.count - a.count || (b.lastLogged < a.lastLogged ? -1 : 1),
    )
    .slice(0, limit)
    .map((meta) => ({
      item: meta.label,
      timesLogged: meta.count,
      lastLogged: meta.lastLogged,
      ...(meta.macros ? { macros: meta.macros } : {}),
    }));
}

/** Storage boundary — production implements this with a bounded recent-log query. */
export interface PriorNutritionSource {
  fetchRecentNutritionLogs(
    userId: string,
    scanLimit: number,
  ): Promise<NutritionLogRow[]>;
}

/**
 * Best-effort retrieval of the user's most-repeated recent foods.
 * Retrieval is context, never a failure — any error degrades to `[]`.
 */
export async function retrievePriorNutrition(
  userId: string,
  source: PriorNutritionSource,
  limit: number = DEFAULT_LIMIT,
): Promise<PriorFood[]> {
  try {
    const rows = await source.fetchRecentNutritionLogs(userId, RECENT_LOG_SCAN);
    return rankPriorNutrition(rows, limit);
  } catch (err) {
    console.error("[retrievePriorNutrition]", err);
    return [];
  }
}