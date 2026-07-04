// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { refreshRuns, type RefreshStatus, type RefreshTrigger } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (that's the pipeline,
 * sub-plan 06). These two calls bracket a single refresh run; the pipeline
 * decides what counts/errors to pass, this module only persists them.
 */

export interface StartRunInput {
  seasonYear: number;
  trigger: RefreshTrigger;
  /** Defaults to now (UTC ISO-8601) if omitted. */
  startedAt?: string;
}

/** Inserts a `running` row and returns its id for the matching `finishRun`. */
export function startRun(input: StartRunInput): number {
  const result = db
    .insert(refreshRuns)
    .values({
      seasonYear: input.seasonYear,
      trigger: input.trigger,
      startedAt: input.startedAt ?? new Date().toISOString(),
      status: "running",
    })
    .run();
  return Number(result.lastInsertRowid);
}

export interface FinishRunInput {
  status: Exclude<RefreshStatus, "running">;
  /** Defaults to now (UTC ISO-8601) if omitted. */
  endedAt?: string;
  perSource?: unknown;
  counts?: unknown;
  error?: string | null;
}

export function finishRun(id: number, input: FinishRunInput): void {
  db.update(refreshRuns)
    .set({
      status: input.status,
      endedAt: input.endedAt ?? new Date().toISOString(),
      ...(input.perSource !== undefined ? { perSource: input.perSource } : {}),
      ...(input.counts !== undefined ? { counts: input.counts } : {}),
      error: input.error ?? null,
    })
    .where(eq(refreshRuns.id, id))
    .run();
}

/** Most recent runs first. */
export function listRuns(seasonYear: number, limit = 20) {
  return db
    .select()
    .from(refreshRuns)
    .where(eq(refreshRuns.seasonYear, seasonYear))
    .orderBy(desc(refreshRuns.id))
    .limit(limit)
    .all();
}
