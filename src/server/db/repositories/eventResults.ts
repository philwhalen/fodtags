// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { eventResults } from "@server/db/schema";

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
