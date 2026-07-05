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
  aceEntries?: number;
}

export interface UpsertAceCountInput {
  seasonYear: number;
  eventId: number;
  aceEntries: number;
}

/** Upserts on `eventId` — sets `paidEntries` only so ace counts are not
 * clobbered (Spec 09 §9.2). */
export function upsertEntryCount(input: UpsertEntryCountInput): void {
  db.insert(entryCounts)
    .values({
      seasonYear: input.seasonYear,
      eventId: input.eventId,
      paidEntries: input.paidEntries,
      aceEntries: input.aceEntries ?? 0,
    })
    .onConflictDoUpdate({
      target: entryCounts.eventId,
      set: { paidEntries: input.paidEntries },
    })
    .run();
}

/** Upserts on `eventId` — sets `aceEntries` only; inserts with
 * `paidEntries: 0` when the row does not exist yet. */
export function upsertAceCount(input: UpsertAceCountInput): void {
  db.insert(entryCounts)
    .values({
      seasonYear: input.seasonYear,
      eventId: input.eventId,
      paidEntries: 0,
      aceEntries: input.aceEntries,
    })
    .onConflictDoUpdate({
      target: entryCounts.eventId,
      set: { aceEntries: input.aceEntries },
    })
    .run();
}

export function getEntryCount(eventId: number) {
  return db.select().from(entryCounts).where(eq(entryCounts.eventId, eventId)).get();
}

export function listEntryCounts(seasonYear: number) {
  return db.select().from(entryCounts).where(eq(entryCounts.seasonYear, seasonYear)).all();
}
