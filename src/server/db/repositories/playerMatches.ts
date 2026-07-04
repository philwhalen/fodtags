// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { playerMatches } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (that's the pure engine,
 * sub-plan 02/03; the auto-match algorithm itself is Common B).
 */

export interface UpsertMatchInput {
  seasonYear: number;
  pdgaNumber: number;
  holderId: number;
  /** Director email, or omitted/null for an unconfirmed auto-match. */
  confirmedBy?: string | null;
  /** Defaults to now (UTC ISO-8601) if omitted. */
  confirmedAt?: string;
}

/** Sticky upsert on `(seasonYear, pdgaNumber)` (Spec 03 §3.5) — a later
 * confirmation for the same PDGA number replaces the earlier one. */
export function upsertMatch(input: UpsertMatchInput): void {
  const confirmedBy = input.confirmedBy ?? null;
  const confirmedAt = input.confirmedAt ?? new Date().toISOString();

  db.insert(playerMatches)
    .values({
      seasonYear: input.seasonYear,
      pdgaNumber: input.pdgaNumber,
      holderId: input.holderId,
      confirmedBy,
      confirmedAt,
    })
    .onConflictDoUpdate({
      target: [playerMatches.seasonYear, playerMatches.pdgaNumber],
      set: { holderId: input.holderId, confirmedBy, confirmedAt },
    })
    .run();
}

export function getMatch(seasonYear: number, pdgaNumber: number) {
  return db
    .select()
    .from(playerMatches)
    .where(and(eq(playerMatches.seasonYear, seasonYear), eq(playerMatches.pdgaNumber, pdgaNumber)))
    .get();
}

export function listMatches(seasonYear: number) {
  return db.select().from(playerMatches).where(eq(playerMatches.seasonYear, seasonYear)).all();
}
