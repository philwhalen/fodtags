// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { seasons } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (that's the pure engine,
 * sub-plan 04).
 */

export function getSeason(year: number) {
  return db.select().from(seasons).where(eq(seasons.year, year)).get();
}

/** Idempotently ensure a season row exists (INSERT ... ON CONFLICT DO
 * NOTHING on the `year` primary key). Returns the number of rows inserted
 * (0 if it already existed). */
export function ensureSeason(year: number): number {
  return db.insert(seasons).values({ year }).onConflictDoNothing({ target: seasons.year }).run()
    .changes;
}
