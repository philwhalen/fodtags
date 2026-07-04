// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { eq } from "drizzle-orm";

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
