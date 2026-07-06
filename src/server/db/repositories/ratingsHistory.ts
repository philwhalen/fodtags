// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { ratingsHistory } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (that's the pure engine,
 * sub-plan 02). "As-of-date" resolution (Spec 02 §2.2) happens inside the
 * pure engine against the full history the snapshot loader hands it, not
 * here.
 */

export interface NewRatingHistoryInput {
  seasonYear: number;
  holderId: number;
  effectiveDate: string;
  rating: number;
  /** Official monthly PDGA pull vs. an unofficial live/round rating
   * (Spec 02 §2.2). Defaults true. */
  official?: boolean;
}

/** Upserts on `(holderId, effectiveDate, official)` so re-ingesting the
 * same monthly pull corrects rather than duplicates. */
/** Upserts an official monthly PDGA rating (`official=true`). */
export function upsertOfficialRating(
  input: Omit<NewRatingHistoryInput, "official">,
): void {
  insertRating({ ...input, official: true });
}

export function insertRating(input: NewRatingHistoryInput): void {
  const official = input.official ?? true;
  db.insert(ratingsHistory)
    .values({
      seasonYear: input.seasonYear,
      holderId: input.holderId,
      effectiveDate: input.effectiveDate,
      rating: input.rating,
      official,
    })
    .onConflictDoUpdate({
      target: [ratingsHistory.holderId, ratingsHistory.effectiveDate, ratingsHistory.official],
      set: { rating: input.rating },
    })
    .run();
}

export function listRatingsByHolder(holderId: number) {
  return db.select().from(ratingsHistory).where(eq(ratingsHistory.holderId, holderId)).all();
}

export function listRatingsBySeason(seasonYear: number) {
  return db.select().from(ratingsHistory).where(eq(ratingsHistory.seasonYear, seasonYear)).all();
}

/**
 * Latest *official* rating per holder for a season, keyed by `holderId`.
 * "Latest" = greatest `effective_date` (lexicographic on `YYYY-MM-DD` is
 * chronological). Powers the admin roster "Rating" column, which reflects the
 * monthly official pull rather than the static `rating_at_entry`.
 */
export function latestOfficialRatingByHolder(seasonYear: number): Map<number, number> {
  const rows = db
    .select()
    .from(ratingsHistory)
    .where(and(eq(ratingsHistory.seasonYear, seasonYear), eq(ratingsHistory.official, true)))
    .all();

  const latestDate = new Map<number, string>();
  const result = new Map<number, number>();
  for (const row of rows) {
    const prior = latestDate.get(row.holderId);
    if (prior === undefined || row.effectiveDate > prior) {
      latestDate.set(row.holderId, row.effectiveDate);
      result.set(row.holderId, row.rating);
    }
  }
  return result;
}
