// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { eventSources, type EventSourceType } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (that's the pure engine,
 * sub-plan 02/03).
 */

export function listActiveSources(seasonYear: number) {
  return db
    .select()
    .from(eventSources)
    .where(and(eq(eventSources.seasonYear, seasonYear), eq(eventSources.active, true)))
    .all();
}

/** All sources regardless of `active` — the engine snapshot (sub-plan 04)
 * needs sub-league dates/complete flags even for a since-deactivated
 * source. */
export function listSources(seasonYear: number) {
  return db.select().from(eventSources).where(eq(eventSources.seasonYear, seasonYear)).all();
}

export function getSource(id: number) {
  return db.select().from(eventSources).where(eq(eventSources.id, id)).get();
}

export interface NewEventSourceInput {
  seasonYear: number;
  pdgaEventId: string;
  type: EventSourceType;
  label: string;
  active?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  complete?: boolean;
  divisions?: string[];
}

/** Used by the admin PDGA-event-configuration form (sub-plan 06) and the
 * seed fixture. */
export function insertSource(input: NewEventSourceInput): number {
  const result = db
    .insert(eventSources)
    .values({
      seasonYear: input.seasonYear,
      pdgaEventId: input.pdgaEventId,
      type: input.type,
      label: input.label,
      active: input.active ?? true,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      complete: input.complete ?? false,
      divisions: input.divisions ?? [],
    })
    .run();
  return Number(result.lastInsertRowid);
}

export type EventSourcePatch = Partial<Omit<NewEventSourceInput, "seasonYear">>;

/** Covers date/active edits and the admin "Mark complete" action (Spec 10
 * §10.3) — callers pass `{ complete: true }`. */
export function updateSource(id: number, patch: EventSourcePatch): void {
  db.update(eventSources).set(patch).where(eq(eventSources.id, id)).run();
}
