// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { events, type EventType } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (that's the pure engine,
 * sub-plan 02/03). No Podium rows are ever inserted here — the Podium is
 * synthesized by the engine (Spec 02 §2.4.1), never persisted.
 */

export interface NewEventInput {
  seasonYear: number;
  eventSourceId: number;
  type: EventType;
  label: string;
  eventDate: string;
  /** The PDGA round number for a League Night; omit/null for
   * Tournament/FOD Open. */
  roundOrdinal?: number | null;
  canceled?: boolean;
}

export function insertEvent(input: NewEventInput): number {
  const result = db
    .insert(events)
    .values({
      seasonYear: input.seasonYear,
      eventSourceId: input.eventSourceId,
      type: input.type,
      label: input.label,
      eventDate: input.eventDate,
      roundOrdinal: input.roundOrdinal ?? null,
      canceled: input.canceled ?? false,
    })
    .run();
  return Number(result.lastInsertRowid);
}

export type EventPatch = Partial<Omit<NewEventInput, "seasonYear" | "eventSourceId">>;

/** Covers the admin "Cancel" action (Spec 10 §10.5) — callers pass
 * `{ canceled: true }`. */
export function updateEvent(id: number, patch: EventPatch): void {
  db.update(events).set(patch).where(eq(events.id, id)).run();
}

export function getEvent(id: number) {
  return db.select().from(events).where(eq(events.id, id)).get();
}

export function listEvents(seasonYear: number) {
  return db.select().from(events).where(eq(events.seasonYear, seasonYear)).all();
}
