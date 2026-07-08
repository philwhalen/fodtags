// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { tagOverrides } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (that's the pure engine,
 * sub-plan 02: `tag_overrides` is the only new admin INPUT for the tag
 * reassignment feature; the resolved per-night timeline itself is computed
 * engine output, not stored here — Spec 02 §2.10 architecture decision 3).
 */

export interface UpsertTagOverrideInput {
  seasonYear: number;
  eventId: number;
  holderId: number;
  /** The observed tag the holder left this night with. */
  tagOut: number;
  /** Director email — an override is always director-decided (Spec 10
   * §10.9). */
  decidedBy: string;
}

export function listOverridesBySeason(seasonYear: number) {
  return db.select().from(tagOverrides).where(eq(tagOverrides.seasonYear, seasonYear)).all();
}

/** Upserts on `(eventId, holderId)` — a director correcting an already-
 * overridden night's tag-out replaces the prior decision. */
export function upsertOverride(input: UpsertTagOverrideInput): void {
  db.insert(tagOverrides)
    .values({
      seasonYear: input.seasonYear,
      eventId: input.eventId,
      holderId: input.holderId,
      tagOut: input.tagOut,
      decidedBy: input.decidedBy,
      decidedAt: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: [tagOverrides.eventId, tagOverrides.holderId],
      set: {
        tagOut: input.tagOut,
        decidedBy: input.decidedBy,
        decidedAt: new Date().toISOString(),
      },
    })
    .run();
}

/** Clears an override back to the engine-computed tag-out for this night. */
export function deleteOverride(eventId: number, holderId: number): void {
  db.delete(tagOverrides)
    .where(and(eq(tagOverrides.eventId, eventId), eq(tagOverrides.holderId, holderId)))
    .run();
}
