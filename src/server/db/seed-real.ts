// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { eventSources, events, seasons } from "@server/db/schema";
import { REAL_2026 } from "@server/db/fixtures/real-2026";
import { upsertOpenings } from "@server/db/repositories/financialOpenings";
import { upsertAceCount, upsertEntryCount } from "@server/db/repositories/entryCounts";
import { insertExpense, listExpenses } from "@server/db/repositories/expenses";
import { insertPayout, listPayouts } from "@server/db/repositories/payouts";
import { insertTagSale, listTagSales } from "@server/db/repositories/tagSales";
import type { SubLeagueType } from "@/lib";

/**
 * Opt-in, dev/validation-aid seed (plans/financials/06-real-data-seed.md):
 * writes the committed `REAL_2026` fixture — the league's real 2026
 * financial figures, extracted from the live Google Sheet — through the
 * SAME admin-mutation repositories a director uses in the admin console.
 * This is deliberately separate from and NOT invoked by the synthetic
 * default `seed()` (src/server/db/seed.ts) or `npm run db:seed`; it is
 * only run via the explicit `npm run db:seed:real` script.
 *
 * Meant for a fresh/dedicated `DATA_DIR` — it intentionally does not clear
 * or reconcile against the synthetic default seed's roster/events; running
 * it against the same DB the default seed populated will layer real
 * League Night/financial rows in alongside the synthetic ones under
 * placeholder `pdgaEventId`s (`REAL-2026-*`), which is harmless for
 * exercising the financials page/read model but not meant to look like a
 * coherent single season.
 *
 * Idempotent: safe to re-run against the same DATA_DIR. Season/event
 * sources/events/entry counts/openings upsert on their natural keys.
 * Tag sales/payouts/expenses have no natural key in the schema (Spec 09
 * §9.2 — they're plain admin-appended rows), so idempotency is guarded at
 * the season level: each of those three tables is only populated the
 * first time this season has zero rows in it.
 */

const PDGA_EVENT_ID_BY_TYPE: Record<SubLeagueType, string> = {
  EARLY: "REAL-2026-EARLY",
  MID: "REAL-2026-MID",
  LATE: "REAL-2026-LATE",
};

export interface SeedRealCounts {
  seasons: number;
  eventSources: number;
  events: number;
  nights: number;
  tagSales: number;
  payouts: number;
  expenses: number;
}

export function seedReal(): SeedRealCounts {
  const seasonYear = REAL_2026.seasonYear;

  const seasonResult = db
    .insert(seasons)
    .values({ year: seasonYear })
    .onConflictDoNothing({ target: seasons.year })
    .run();

  let eventSourceChanges = 0;
  for (const window of REAL_2026.subLeagues) {
    const sourceResult = db
      .insert(eventSources)
      .values({
        seasonYear,
        pdgaEventId: PDGA_EVENT_ID_BY_TYPE[window.type],
        type: window.type,
        active: true,
        label: `2026 FOD Tags — ${window.type} (real-data validation fixture)`,
        startDate: window.startDate,
        endDate: window.endDate,
        complete: false,
        divisions: ["MPO", "MA1"],
      })
      .onConflictDoUpdate({
        target: [eventSources.seasonYear, eventSources.type],
        set: { startDate: window.startDate, endDate: window.endDate },
      })
      .run();
    eventSourceChanges += sourceResult.changes;
  }

  const sourceIdByType = new Map(
    db
      .select({ type: eventSources.type, id: eventSources.id })
      .from(eventSources)
      .where(eq(eventSources.seasonYear, seasonYear))
      .all()
      .map((s) => [s.type, s.id]),
  );

  let eventChanges = 0;
  let nightsSeeded = 0;
  // 1-based round ordinal within each sub-league's own night list — the
  // fixture's real PDGA round numbers aren't part of this financial-only
  // fixture, so nights are numbered in the chronological order they appear
  // in `REAL_2026.nights`.
  const roundOrdinalBySubLeague = new Map<SubLeagueType, number>();

  for (const night of REAL_2026.nights) {
    const eventSourceId = sourceIdByType.get(night.subLeagueType);
    if (eventSourceId === undefined) {
      throw new Error(`seedReal: unknown sub-league type "${night.subLeagueType}"`);
    }
    const roundOrdinal = (roundOrdinalBySubLeague.get(night.subLeagueType) ?? 0) + 1;
    roundOrdinalBySubLeague.set(night.subLeagueType, roundOrdinal);

    const eventInsert = db
      .insert(events)
      .values({
        seasonYear,
        eventSourceId,
        type: "LeagueNight",
        label: `${night.subLeagueType} League Night ${roundOrdinal} (real, ${night.eventDate})`,
        eventDate: night.eventDate,
        roundOrdinal,
        canceled: false,
      })
      .onConflictDoUpdate({
        target: [events.eventSourceId, events.roundOrdinal],
        set: { eventDate: night.eventDate },
      })
      .run();
    eventChanges += eventInsert.changes;

    const eventRow = db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.eventSourceId, eventSourceId), eq(events.roundOrdinal, roundOrdinal)))
      .get();
    if (eventRow === undefined) {
      throw new Error(
        `seedReal: event row missing after insert for ${night.subLeagueType} round ${roundOrdinal}`,
      );
    }

    upsertEntryCount({ seasonYear, eventId: eventRow.id, paidEntries: night.paidEntries });
    upsertAceCount({ seasonYear, eventId: eventRow.id, aceEntries: night.aceEntries });
    nightsSeeded += 1;
  }

  upsertOpenings({
    seasonYear,
    aceOpeningCents: REAL_2026.openings.aceOpeningCents,
    reservesOpeningCents: REAL_2026.openings.reservesOpeningCents,
  });

  let tagSaleChanges = 0;
  if (listTagSales(seasonYear).length === 0) {
    for (const sale of REAL_2026.tagSales) {
      insertTagSale({ seasonYear, saleDate: sale.saleDate, count: sale.count });
      tagSaleChanges += 1;
    }
  }

  let payoutChanges = 0;
  if (listPayouts(seasonYear).length === 0) {
    insertPayout({
      seasonYear,
      kind: "ACE",
      paidDate: REAL_2026.acePayout.paidDate,
      amountCents: REAL_2026.acePayout.amountCents,
    });
    payoutChanges += 1;
  }

  let expenseChanges = 0;
  if (listExpenses(seasonYear).length === 0) {
    for (const expense of REAL_2026.expenses) {
      insertExpense({
        seasonYear,
        spentDate: expense.spentDate,
        amountCents: expense.amountCents,
        category: expense.category,
        description: expense.description,
      });
      expenseChanges += 1;
    }
  }

  return {
    seasons: seasonResult.changes,
    eventSources: eventSourceChanges,
    events: eventChanges,
    nights: nightsSeeded,
    tagSales: tagSaleChanges,
    payouts: payoutChanges,
    expenses: expenseChanges,
  };
}
