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

/**
 * Opt-in real-data seed: writes the league's actual 2026 FINANCIAL figures
 * (the committed `REAL_2026` fixture, extracted from the live Google Sheet
 * "Financials" tab) through the SAME admin-mutation repositories a director
 * uses — but ATTACHES the per-night paid/ace counts to the real events that
 * already exist in this DATA_DIR (scraped from live PDGA), instead of
 * fabricating its own placeholder event sources.
 *
 * This is the financials counterpart to `seedRealRoster` (which loads the
 * real roster onto the same real-data DB). Use it — NOT `seedReal`
 * (src/server/db/seed-real.ts) — when the season's real roster/rounds are
 * already present from a live refresh:
 *   - `seedReal` is built for a FRESH/dedicated DATA_DIR: it invents
 *     `REAL-2026-<TYPE>` event sources and LeagueNight events for the
 *     financial fixture. Run against a live-scraped DB it would clobber the
 *     real MID source's window and fabricate an empty LATE source.
 *   - this seeder writes ONLY financial rows (openings, entry/ace counts,
 *     tag sales, ace payout, expenses); it never creates or edits
 *     event_sources or events. Nights are matched to existing events by
 *     (sub-league type → event source) + event date.
 *
 * A fixture night with no matching real event is reported (not silently
 * skipped). Real events with no fixture night (e.g. a played round the sheet
 * hasn't been filled in for yet, like 2026-07-02 at extraction) are left
 * without an entry count — the engine treats that as zero, matching the
 * sheet's blank row.
 *
 * Idempotent: openings/entry counts upsert on their natural keys; tag
 * sales/payouts/expenses (no natural key — plain admin-appended rows, Spec
 * 09 §9.2) are only populated the first time this season has zero rows in
 * the relevant table.
 *
 * NOT invoked by boot or by `npm run db:seed`; run explicitly via
 * `npm run db:seed:real-financials`.
 */

export interface SeedRealFinancialsCounts {
  openings: 1;
  nights: number;
  unmatchedNights: number;
  tagSales: number;
  payouts: number;
  expenses: number;
}

export function seedRealFinancials(): SeedRealFinancialsCounts {
  const seasonYear = REAL_2026.seasonYear;

  // Season must already exist (this seeder attaches to a live-scraped DB); do
  // not fabricate one — surface the misconfiguration instead.
  const season = db
    .select({ year: seasons.year })
    .from(seasons)
    .where(eq(seasons.year, seasonYear))
    .get();
  if (season === undefined) {
    throw new Error(
      `seedRealFinancials: season ${seasonYear} not found — run the roster/refresh seed first`,
    );
  }

  // Resolve each sub-league type to the real (live-scraped) event source id.
  const sourceIdByType = new Map(
    db
      .select({ type: eventSources.type, id: eventSources.id })
      .from(eventSources)
      .where(eq(eventSources.seasonYear, seasonYear))
      .all()
      .map((s) => [s.type, s.id]),
  );

  let nights = 0;
  const unmatched: string[] = [];
  for (const night of REAL_2026.nights) {
    const eventSourceId = sourceIdByType.get(night.subLeagueType);
    if (eventSourceId === undefined) {
      unmatched.push(`${night.eventDate} (no ${night.subLeagueType} event source)`);
      continue;
    }
    const eventRow = db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.eventSourceId, eventSourceId), eq(events.eventDate, night.eventDate)))
      .get();
    if (eventRow === undefined) {
      unmatched.push(`${night.eventDate} (no ${night.subLeagueType} event on that date)`);
      continue;
    }
    upsertEntryCount({ seasonYear, eventId: eventRow.id, paidEntries: night.paidEntries });
    upsertAceCount({ seasonYear, eventId: eventRow.id, aceEntries: night.aceEntries });
    nights += 1;
  }
  if (unmatched.length > 0) {
    console.warn(
      `[db:seed:real-financials] ${unmatched.length} fixture night(s) had no matching real event and were skipped:\n  - ${unmatched.join("\n  - ")}`,
    );
  }

  upsertOpenings({
    seasonYear,
    aceOpeningCents: REAL_2026.openings.aceOpeningCents,
    reservesOpeningCents: REAL_2026.openings.reservesOpeningCents,
  });

  let tagSales = 0;
  if (listTagSales(seasonYear).length === 0) {
    for (const sale of REAL_2026.tagSales) {
      insertTagSale({ seasonYear, saleDate: sale.saleDate, count: sale.count });
      tagSales += 1;
    }
  }

  let payouts = 0;
  if (listPayouts(seasonYear).length === 0) {
    insertPayout({
      seasonYear,
      kind: "ACE",
      paidDate: REAL_2026.acePayout.paidDate,
      amountCents: REAL_2026.acePayout.amountCents,
    });
    payouts += 1;
  }

  let expenses = 0;
  if (listExpenses(seasonYear).length === 0) {
    for (const expense of REAL_2026.expenses) {
      insertExpense({
        seasonYear,
        spentDate: expense.spentDate,
        amountCents: expense.amountCents,
        category: expense.category,
        description: expense.description,
      });
      expenses += 1;
    }
  }

  return {
    openings: 1,
    nights,
    unmatchedNights: unmatched.length,
    tagSales,
    payouts,
    expenses,
  };
}
