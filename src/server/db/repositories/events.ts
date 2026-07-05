// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { and, eq } from "drizzle-orm";

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

export interface UpsertLeagueNightInput {
  seasonYear: number;
  eventSourceId: number;
  roundOrdinal: number;
  label: string;
  eventDate: string;
}

/** Idempotent upsert on `(eventSourceId, roundOrdinal)`. Updates PDGA-derived
 * `label`/`eventDate` on conflict; never overwrites admin-owned `canceled`. */
export function upsertLeagueNight(input: UpsertLeagueNightInput): number {
  db.insert(events)
    .values({
      seasonYear: input.seasonYear,
      eventSourceId: input.eventSourceId,
      type: "LeagueNight",
      label: input.label,
      eventDate: input.eventDate,
      roundOrdinal: input.roundOrdinal,
      canceled: false,
    })
    .onConflictDoUpdate({
      target: [events.eventSourceId, events.roundOrdinal],
      set: {
        label: input.label,
        eventDate: input.eventDate,
      },
    })
    .run();

  const row = db
    .select({ id: events.id })
    .from(events)
    .where(
      and(eq(events.eventSourceId, input.eventSourceId), eq(events.roundOrdinal, input.roundOrdinal)),
    )
    .get();
  if (row === undefined) {
    throw new Error(
      `upsertLeagueNight: row missing after upsert for source ${input.eventSourceId} round ${input.roundOrdinal}`,
    );
  }
  return row.id;
}
