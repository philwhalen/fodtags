// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@server/db/client";
import { eventResults, events } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (that's the pure engine,
 * sub-plan 02/03). Player matching (which sets `holderId`) is applied by
 * ingestion (Common B) / the admin review queue (Spec 10 §10.4), not here.
 */

export interface NewEventResultInput {
  seasonYear: number;
  eventId: number;
  pdgaNumber?: number | null;
  displayName: string;
  holderId?: number | null;
  rawScoreToPar: number;
  roundRating?: number | null;
  playerRatingReported?: number | null;
  tagPresent?: boolean;
  roundFinal?: boolean;
}

function toRow(input: NewEventResultInput) {
  return {
    seasonYear: input.seasonYear,
    eventId: input.eventId,
    pdgaNumber: input.pdgaNumber ?? null,
    displayName: input.displayName,
    holderId: input.holderId ?? null,
    rawScoreToPar: input.rawScoreToPar,
    roundRating: input.roundRating ?? null,
    playerRatingReported: input.playerRatingReported ?? null,
    tagPresent: input.tagPresent ?? true,
    roundFinal: input.roundFinal ?? true,
  };
}

export function insertResult(input: NewEventResultInput): number {
  const result = db.insert(eventResults).values(toRow(input)).run();
  return Number(result.lastInsertRowid);
}

/** Bulk insert for a whole event's field (ingestion's typical shape). */
export function insertResults(inputs: NewEventResultInput[]): void {
  if (inputs.length === 0) {
    return;
  }
  db.insert(eventResults)
    .values(inputs.map(toRow))
    .run();
}

export type EventResultPatch = Partial<Omit<NewEventResultInput, "seasonYear" | "eventId">>;

/** Covers the admin "tag-not-present" flag and result overrides (Spec 10
 * §10.5) and sticky player-match linking (`holderId`). */
export function updateResult(id: number, patch: EventResultPatch): void {
  db.update(eventResults).set(patch).where(eq(eventResults.id, id)).run();
}

export function getResult(id: number) {
  return db.select().from(eventResults).where(eq(eventResults.id, id)).get();
}

export function listResultsByEvent(eventId: number) {
  return db.select().from(eventResults).where(eq(eventResults.eventId, eventId)).all();
}

export function listResultsBySeason(seasonYear: number) {
  return db.select().from(eventResults).where(eq(eventResults.seasonYear, seasonYear)).all();
}

/** Round count so far for a holder (Spec 10 §10.4 section-A summary —
 * "round count so far" on the provisional-holder confirmation screen). */
export function countResultsForHolder(seasonYear: number, holderId: number): number {
  return db
    .select()
    .from(eventResults)
    .where(and(eq(eventResults.seasonYear, seasonYear), eq(eventResults.holderId, holderId)))
    .all().length;
}

/**
 * The holder's earliest attributed round this season (by event date) with the
 * reported rating from that round, or `undefined` if they have no attributed
 * results. The refresh uses this to back-date an auto-added holder's entry
 * date to their true FIRST ingested round when they appear across multiple
 * sub-leagues in one run (Spec 03 §3.5 — "entry date = first ingested
 * round"). */
export function earliestAttributedRound(
  seasonYear: number,
  holderId: number,
): { eventDate: string; playerRatingReported: number | null } | undefined {
  return db
    .select({
      eventDate: events.eventDate,
      playerRatingReported: eventResults.playerRatingReported,
    })
    .from(eventResults)
    .innerJoin(events, eq(events.id, eventResults.eventId))
    .where(and(eq(eventResults.seasonYear, seasonYear), eq(eventResults.holderId, holderId)))
    .orderBy(asc(events.eventDate))
    .limit(1)
    .get();
}

export interface UpsertResultInput {
  seasonYear: number;
  eventId: number;
  pdgaNumber: number | null;
  displayName: string;
  holderId: number | null;
  rawScoreToPar: number;
  roundRating?: number | null;
  playerRatingReported?: number | null;
  roundFinal?: boolean;
}

/** Idempotent upsert on `(eventId, pdgaNumber)` when `pdgaNumber` is set.
 * Updates PDGA facts and `holderId` on conflict; never overwrites
 * admin-owned `tagPresent`. Guest rows (`pdgaNumber` null) cannot use the
 * SQLite unique index for dedup — matched by `(eventId, displayName)` instead. */
export function upsertResult(input: UpsertResultInput): number {
  const facts = {
    displayName: input.displayName,
    holderId: input.holderId,
    rawScoreToPar: input.rawScoreToPar,
    roundRating: input.roundRating ?? null,
    playerRatingReported: input.playerRatingReported ?? null,
    roundFinal: input.roundFinal ?? true,
  };

  if (input.pdgaNumber === null) {
    const existing = db
      .select({ id: eventResults.id })
      .from(eventResults)
      .where(
        and(
          eq(eventResults.eventId, input.eventId),
          isNull(eventResults.pdgaNumber),
          eq(eventResults.displayName, input.displayName),
        ),
      )
      .get();
    if (existing !== undefined) {
      db.update(eventResults).set(facts).where(eq(eventResults.id, existing.id)).run();
      return existing.id;
    }
    return insertResult({ ...input, tagPresent: true });
  }

  db.insert(eventResults)
    .values({
      seasonYear: input.seasonYear,
      eventId: input.eventId,
      pdgaNumber: input.pdgaNumber,
      ...facts,
      tagPresent: true,
    })
    .onConflictDoUpdate({
      target: [eventResults.eventId, eventResults.pdgaNumber],
      set: facts,
    })
    .run();

  const row = db
    .select({ id: eventResults.id })
    .from(eventResults)
    .where(
      and(eq(eventResults.eventId, input.eventId), eq(eventResults.pdgaNumber, input.pdgaNumber)),
    )
    .get();
  if (row === undefined) {
    throw new Error(
      `upsertResult: row missing after upsert for event ${input.eventId} pdga ${input.pdgaNumber}`,
    );
  }
  return row.id;
}

/** Back-fill `holderId` on all result rows for a PDGA number (admin review
 * queue resolution — Spec 10 §10.4). Returns rows updated. */
export function setHolderIdByPdgaNumber(
  seasonYear: number,
  pdgaNumber: number,
  holderId: number | null,
): number {
  const result = db
    .update(eventResults)
    .set({ holderId })
    .where(and(eq(eventResults.seasonYear, seasonYear), eq(eventResults.pdgaNumber, pdgaNumber)))
    .run();
  return result.changes;
}
