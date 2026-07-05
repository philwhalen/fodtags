// Validation-aid test (plans/financials/06-real-data-seed.md) — NOT a spec
// change. Pure: no DB, no clock, no `server-only`. Builds a
// `SeasonSnapshotFinancial` straight from the committed real-2026 fixture
// (src/server/db/fixtures/real-2026.ts) and asserts `computeFinancials`
// reproduces the league's own hand-verified balances to the cent.
//
// The expected values (`REAL_2026_GOLDEN`) are a POINT-IN-TIME SNAPSHOT of
// the source Google Sheet as of 2026-07-05 — the sheet keeps changing as
// the season runs (MID was mid-season, LATE not yet started at extraction
// time). If the fixture is re-extracted from a later sheet state, these
// expectations must be refreshed to match.
import { describe, expect, it } from "vitest";

import { computeFinancials } from "@server/engine/financial";
import {
  REAL_2026,
  REAL_2026_GOLDEN,
  REAL_2026_TOTALS,
} from "@server/db/fixtures/real-2026";
import type {
  SeasonSnapshotExpense,
  SeasonSnapshotFinancial,
  SeasonSnapshotNight,
  SeasonSnapshotPayout,
  SeasonSnapshotTagSale,
  SubLeagueType,
} from "@/lib";

const ALL_INCOMPLETE: Record<SubLeagueType, boolean> = {
  EARLY: false,
  MID: false,
  LATE: false,
};

/**
 * Builds the pure engine's `SeasonSnapshotFinancial` input from the
 * fixture, synthesizing sequential ids the same way the real DB's
 * autoincrement columns would (the engine only uses these ids to build
 * `sourceRef` for ledger ordering — their absolute values don't matter).
 */
function buildFinancialSnapshot(): SeasonSnapshotFinancial {
  const nights: SeasonSnapshotNight[] = REAL_2026.nights.map((night, index) => ({
    eventId: index + 1,
    subLeagueType: night.subLeagueType,
    eventDate: night.eventDate,
    paidEntries: night.paidEntries,
    aceEntries: night.aceEntries,
  }));

  const tagSales: SeasonSnapshotTagSale[] = REAL_2026.tagSales.map((sale, index) => ({
    id: index + 1,
    saleDate: sale.saleDate,
    count: sale.count,
  }));

  const payouts: SeasonSnapshotPayout[] = [
    {
      id: 1,
      kind: "ACE",
      paidDate: REAL_2026.acePayout.paidDate,
      amountCents: REAL_2026.acePayout.amountCents,
      subLeague: null,
      pool: null,
      recipientHolderId: null,
    },
  ];

  const expenses: SeasonSnapshotExpense[] = REAL_2026.expenses.map((expense, index) => ({
    id: index + 1,
    spentDate: expense.spentDate,
    amountCents: expense.amountCents,
    category: expense.category,
    description: expense.description,
  }));

  return {
    openings: {
      aceCents: REAL_2026.openings.aceOpeningCents,
      reservesCents: REAL_2026.openings.reservesOpeningCents,
    },
    nights,
    tagSales,
    payouts,
    expenses,
    adjustments: [],
  };
}

describe("real-2026 fixture — internal consistency", () => {
  it("nights sum to the recorded paid/ace totals (256 / 200)", () => {
    const paidEntries = REAL_2026.nights.reduce((acc, n) => acc + n.paidEntries, 0);
    const aceEntries = REAL_2026.nights.reduce((acc, n) => acc + n.aceEntries, 0);
    expect(paidEntries).toBe(REAL_2026_TOTALS.paidEntries);
    expect(aceEntries).toBe(REAL_2026_TOTALS.aceEntries);
  });

  it("tag sales sum to 27 tags", () => {
    const totalTags = REAL_2026.tagSales.reduce((acc, s) => acc + s.count, 0);
    expect(totalTags).toBe(27);
  });
});

describe("real-2026 fixture — computeFinancials reconciliation (golden, point-in-time)", () => {
  const result = computeFinancials({
    seasonYear: REAL_2026.seasonYear,
    subLeagueComplete: ALL_INCOMPLETE,
    financial: buildFinancialSnapshot(),
  });

  it("reproduces the OLP pot per sub-league exactly", () => {
    expect(result.funds.olp.EARLY).toBe(REAL_2026_GOLDEN.olpCents.EARLY);
    expect(result.funds.olp.MID).toBe(REAL_2026_GOLDEN.olpCents.MID);
    expect(result.funds.olp.LATE).toBe(REAL_2026_GOLDEN.olpCents.LATE);
  });

  it("reproduces the skins A/B split exactly (exact cents, not the sheet's rounded display)", () => {
    expect(result.funds.skins.A).toBe(REAL_2026_GOLDEN.skinsCents.A);
    expect(result.funds.skins.B).toBe(REAL_2026_GOLDEN.skinsCents.B);
  });

  it("reproduces the ace fund exactly (gross balance, matching the sheet's own Total Ace Pot Balance)", () => {
    expect(result.funds.ace).toBe(REAL_2026_GOLDEN.aceCents);
  });

  it("reproduces the reserves fund exactly", () => {
    expect(result.funds.reserves).toBe(REAL_2026_GOLDEN.reservesCents);
  });

  it("reproduces total cash exactly, and total cash equals the sum of every fund", () => {
    expect(result.totalCashCents).toBe(REAL_2026_GOLDEN.totalCashCents);

    const sumOfFunds =
      result.funds.reserves +
      result.funds.ace +
      result.funds.olp.EARLY +
      result.funds.olp.MID +
      result.funds.olp.LATE +
      result.funds.skins.A +
      result.funds.skins.B;
    expect(sumOfFunds).toBe(result.totalCashCents);
  });

  it("is still projected (all sub-leagues incomplete)", () => {
    expect(result.projected).toBe(true);
  });
});
