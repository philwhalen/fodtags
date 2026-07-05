// PLAIN DATA — NO I/O. Importable by both the reconciliation test
// (src/server/engine/real-2026-reconciliation.test.ts) and the opt-in real
// seed script (scripts/db-seed-real.ts via src/server/db/seed-real.ts).
//
// This is a dev/validation-aid fixture (plans/financials/06-real-data-seed.md)
// — it changes no spec, no engine, no product behavior. It exists so the
// computed financials engine can be checked against the league's own
// hand-maintained numbers for a real, in-progress season.
//
// PROVENANCE
// ==========
// Source: Google Sheet "2026 Field Of Dreams Club Championship Scores"
//   id 15Iof5XV5sQo7D9BMPS1L4OKWNw9O0iky7ipeu8VxV80, tab "Financials".
// Sheet last modified: 2026-06-26. Extracted: 2026-07-05.
// This is a POINT-IN-TIME SNAPSHOT — the live sheet keeps changing as the
// season progresses (MID was still being played at extraction time; LATE
// had not started). Re-extract and refresh this fixture (and the golden
// constants in `REAL_2026_GOLDEN` / `REAL_2026_TOTALS` below, plus the
// reconciliation test that asserts them) periodically, not on every read.
//
// Sub-league windows at extraction time (per the sheet's own night list):
//   EARLY: 2026-03-12 .. 2026-05-14 (10 League Nights recorded)
//   MID:   2026-05-21 .. 2026-06-25 (6 League Nights recorded)
//   LATE:  2026-07-02 onward — no nights played/recorded yet at extraction.
//
// `pdgaEventId` values below are placeholders (`REAL-2026-<TYPE>`), not the
// league's actual PDGA event ids — this fixture is a *financial* validation
// aid only; it does not attempt to reproduce the roster/rounds/ratings side
// of the real season (that's covered by the synthetic seed in
// src/server/db/seed.ts).
import type { ExpenseCategory, SubLeagueType } from "@/lib";

export interface RealSubLeagueWindowFixture {
  type: SubLeagueType;
  /** ET calendar date, `YYYY-MM-DD`. */
  startDate: string;
  /** ET calendar date, `YYYY-MM-DD`, or null if not yet known (LATE, not
   * started at extraction time). */
  endDate: string | null;
}

export interface RealNightFixture {
  subLeagueType: SubLeagueType;
  /** ET calendar date, `YYYY-MM-DD`. */
  eventDate: string;
  paidEntries: number;
  aceEntries: number;
}

export interface RealTagSaleFixture {
  /** ET calendar date, `YYYY-MM-DD`. */
  saleDate: string;
  count: number;
}

export interface RealAcePayoutFixture {
  /** ET calendar date, `YYYY-MM-DD`. */
  paidDate: string;
  amountCents: number;
}

export interface RealExpenseFixture {
  /** ET calendar date, `YYYY-MM-DD`. The sheet does not date expenses
   * precisely; these are sensible in-season dates chosen for ledger
   * ordering only — they do not affect any fund total. */
  spentDate: string;
  amountCents: number;
  category: ExpenseCategory;
  description: string;
}

export interface Real2026Fixture {
  seasonYear: number;
  /** 2026 carryover balances (Spec 09 §9.2 openings). */
  openings: { reservesOpeningCents: number; aceOpeningCents: number };
  subLeagues: RealSubLeagueWindowFixture[];
  /** All recorded League Nights, in chronological order. 16 nights at
   * extraction time: 10 EARLY + 6 MID + 0 LATE. */
  nights: RealNightFixture[];
  /** Dated tag-sale batches; $20/tag → reserves (Spec 09 §9.1). */
  tagSales: RealTagSaleFixture[];
  /** The one recorded ace-pot payout to date. */
  acePayout: RealAcePayoutFixture;
  expenses: RealExpenseFixture[];
}

export const REAL_2026: Real2026Fixture = {
  seasonYear: 2026,

  // "Financials" tab, opening-balance block.
  openings: {
    reservesOpeningCents: 637, // $6.37
    aceOpeningCents: 13900, // $139.00
  },

  subLeagues: [
    { type: "EARLY", startDate: "2026-03-12", endDate: "2026-05-14" },
    { type: "MID", startDate: "2026-05-21", endDate: "2026-06-25" },
    { type: "LATE", startDate: "2026-07-02", endDate: null },
  ],

  // "Financials" tab, per-night paid/ace entry columns.
  nights: [
    // EARLY (10 nights; paid totals 160, ace totals 135)
    { subLeagueType: "EARLY", eventDate: "2026-03-12", paidEntries: 14, aceEntries: 13 },
    { subLeagueType: "EARLY", eventDate: "2026-03-19", paidEntries: 13, aceEntries: 10 },
    { subLeagueType: "EARLY", eventDate: "2026-03-26", paidEntries: 13, aceEntries: 14 },
    { subLeagueType: "EARLY", eventDate: "2026-04-02", paidEntries: 15, aceEntries: 13 },
    { subLeagueType: "EARLY", eventDate: "2026-04-09", paidEntries: 21, aceEntries: 22 },
    { subLeagueType: "EARLY", eventDate: "2026-04-16", paidEntries: 19, aceEntries: 14 },
    { subLeagueType: "EARLY", eventDate: "2026-04-23", paidEntries: 14, aceEntries: 11 },
    { subLeagueType: "EARLY", eventDate: "2026-04-30", paidEntries: 15, aceEntries: 11 },
    { subLeagueType: "EARLY", eventDate: "2026-05-07", paidEntries: 17, aceEntries: 12 },
    { subLeagueType: "EARLY", eventDate: "2026-05-14", paidEntries: 19, aceEntries: 15 },
    // MID (6 nights; paid totals 96, ace totals 65)
    { subLeagueType: "MID", eventDate: "2026-05-21", paidEntries: 17, aceEntries: 11 },
    { subLeagueType: "MID", eventDate: "2026-05-28", paidEntries: 19, aceEntries: 13 },
    { subLeagueType: "MID", eventDate: "2026-06-04", paidEntries: 18, aceEntries: 12 },
    { subLeagueType: "MID", eventDate: "2026-06-11", paidEntries: 15, aceEntries: 9 },
    { subLeagueType: "MID", eventDate: "2026-06-18", paidEntries: 14, aceEntries: 11 },
    { subLeagueType: "MID", eventDate: "2026-06-25", paidEntries: 13, aceEntries: 9 },
    // LATE: none yet — sub-league starts 2026-07-02, no nights recorded.
  ],

  // "Financials" tab, tag-sale batch block. Sum = 27 tags.
  tagSales: [
    { saleDate: "2026-03-12", count: 14 },
    { saleDate: "2026-03-19", count: 1 },
    { saleDate: "2026-03-26", count: 2 },
    { saleDate: "2026-04-09", count: 3 },
    { saleDate: "2026-04-16", count: 1 },
    { saleDate: "2026-04-23", count: 1 },
    { saleDate: "2026-04-30", count: 1 },
    { saleDate: "2026-05-21", count: 1 },
    { saleDate: "2026-06-04", count: 1 },
    { saleDate: "2026-06-18", count: 2 },
  ],

  // "Financials" tab, ace-pot payout row.
  acePayout: { paidDate: "2026-05-07", amountCents: 17400 }, // $174.00

  // "Financials" tab, expense block — against Expense Reserves. The sheet
  // does not date these precisely; dates below are sensible in-season
  // placements (do not affect fund totals, only ledger display order).
  expenses: [
    { spentDate: "2026-03-01", amountCents: 7500, category: "pdga_fees", description: "League sanctioning fees x3" },
    { spentDate: "2026-04-01", amountCents: 8000, category: "pdga_fees", description: "Early League player fees" },
    { spentDate: "2026-03-15", amountCents: 6545, category: "ctp", description: "New CTP flags" },
    { spentDate: "2026-04-15", amountCents: 58000, category: "ctp", description: "CTPs" },
    { spentDate: "2026-02-15", amountCents: 20000, category: "contingency", description: "Tags (inventory purchase)" },
  ],
};

/**
 * Golden reconciliation targets, hand-verified against the sheet's own
 * balance-sheet block at extraction time (2026-07-05). The reconciliation
 * test asserts `computeFinancials(...)` reproduces these EXACTLY, in cents.
 *
 * - OLP: $1 × paidEntries per sub-league (Spec 09 §9.1).
 * - Skins: per-night largest-remainder 2/3 (A) / 1/3 (B) split of 280¢ ×
 *   paidEntries (Spec 09 §9.2.2, `splitSkinsCents`); note the sheet's own
 *   Leaderboard tab shows whole-dollar-ROUNDED figures ($478 A / $239 B /
 *   $717 total) — our model is the exact-cents figure below ($477.87 /
 *   $238.93 / $716.80); the difference is display rounding, not a
 *   discrepancy to "fix".
 * - Ace: openings.aceOpeningCents + 100¢ × total ace entries − ace payouts.
 *   The sheet's Leaderboard "Ace Pot: $111" nets out a $55 ace-backup
 *   reserve that our spec does NOT model; our ace FUND is the gross
 *   balance, which matches the sheet's own "Total Ace Pot Balance: $165".
 * - Reserves: openings.reservesOpeningCents + 220¢ × paidEntries + 2000¢ ×
 *   tag count − expenses.
 * - Total cash: sum of every fund above.
 */
export const REAL_2026_GOLDEN = {
  olpCents: { EARLY: 16000, MID: 9600, LATE: 0 }, // $160 / $96 / $0
  skinsCents: { A: 47787, B: 23893 }, // $477.87 / $238.93
  aceCents: 16500, // $165.00
  reservesCents: 10912, // $109.12
  totalCashCents: 124692, // $1,246.92
} as const;

/** Fixture-level entry-count totals across all recorded nights — a
 * sanity check that the per-night rows above were transcribed correctly. */
export const REAL_2026_TOTALS = {
  paidEntries: 256,
  aceEntries: 200,
} as const;
