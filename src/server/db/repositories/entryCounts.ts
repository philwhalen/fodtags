// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { entryCounts } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (the entry-count-to-dollars
 * split math is Common C / Spec 09 §9.2).
 */

export interface UpsertEntryCountInput {
  seasonYear: number;
  eventId: number;
  paidEntries: number;
}

/** Upserts on `eventId` — a director can correct a night's count any time;
 * the latest write is the cash source of truth (Spec 09 §9.2). */
export function upsertEntryCount(input: UpsertEntryCountInput): void {
  db.insert(entryCounts)
    .values(input)
    .onConflictDoUpdate({
      target: entryCounts.eventId,
      set: { paidEntries: input.paidEntries },
    })
    .run();
}

export function getEntryCount(eventId: number) {
  return db.select().from(entryCounts).where(eq(entryCounts.eventId, eventId)).get();
}

export function listEntryCounts(seasonYear: number) {
  return db.select().from(entryCounts).where(eq(entryCounts.seasonYear, seasonYear)).all();
}
