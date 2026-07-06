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
// Sheet last modified: 2026-06-26. Extracted: 2026-07-05; ace payout
// re-verified against the live "Financials" tab 2026-07-06 ($173.53, not the
// earlier $174.00 approximation — see acePayout / REAL_2026_GOLDEN.aceCents).
// This is a POINT-IN-TIME SNAPSHOT — the live sheet keeps changing as the
// season progresses (MID was still being played at extraction time; LATE
// had not started). Re-extract and refresh this fixture (and the golden
// constants in `REAL_2026_GOLDEN` / `REAL_2026_TOTALS` below, plus the
// reconciliation test that asserts them) periodically, not on every read.
//
// Each sub-league is ONE PDGA event (up to 10 Thursday-night rounds); the
// season runs two such events so far — EARLY and MID:
//   EARLY: PDGA 102021, 2026-03-12 .. 2026-05-14 (10 rounds, complete).
//   MID:   PDGA 104527, 2026-05-21 .. 2026-07-23 (10-round series; 6 nights
//          had recorded financials at extraction — the sheet had not yet
//          entered entry fees for round 7 / 2026-07-02 onward).
//   LATE:  its own PDGA event, not registered/played yet — so it has no
//          window or nights here. (Do NOT split MID's event by round to
//          synthesize LATE; LATE arrives with its own event id and data.)
//
// `pdgaEventId` values below are placeholders (`REAL-2026-<TYPE>`), not the
// league's actual PDGA event ids — this fixture is a *financial* validation
// aid only; it does not attempt to reproduce the roster/rounds/ratings side
// of the real season (that's covered by the synthetic seed in
// src/server/db/seed.ts).
import type { ExpenseCategory, SubLeagueType } from "@/lib";

export interface RealSubLeagueWindowFixture {
  type: SubLeagueType;
  /** ET calendar date, `YYYY-MM-DD` — the sub-league's PDGA event start
   * (round 1). */
  startDate: string;
  /** ET calendar date, `YYYY-MM-DD`, or null if the event's end is not yet
   * known. Spans the whole PDGA event (all rounds), not just the nights with
   * recorded financials. */
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
  /** League Nights with recorded financials, in chronological order. 16 at
   * extraction time: 10 EARLY + 6 MID (MID's later rounds — 2026-07-02 on —
   * were played but had no entry-fee data entered yet). */
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

  // One PDGA event per sub-league; MID spans its full 10-round series. LATE
  // is a separate, not-yet-registered event, so it is intentionally absent.
  subLeagues: [
    { type: "EARLY", startDate: "2026-03-12", endDate: "2026-05-14" },
    { type: "MID", startDate: "2026-05-21", endDate: "2026-07-23" },
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
    // MID, PDGA 104527 rounds 1-6 (paid totals 96, ace totals 65). Rounds 7+
    // (2026-07-02 on) were played but had no entry-fee data at extraction.
    { subLeagueType: "MID", eventDate: "2026-05-21", paidEntries: 17, aceEntries: 11 },
    { subLeagueType: "MID", eventDate: "2026-05-28", paidEntries: 19, aceEntries: 13 },
    { subLeagueType: "MID", eventDate: "2026-06-04", paidEntries: 18, aceEntries: 12 },
    { subLeagueType: "MID", eventDate: "2026-06-11", paidEntries: 15, aceEntries: 9 },
    { subLeagueType: "MID", eventDate: "2026-06-18", paidEntries: 14, aceEntries: 11 },
    { subLeagueType: "MID", eventDate: "2026-06-25", paidEntries: 13, aceEntries: 9 },
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

  // "Financials" tab, ace-pot payout row (col J, 2026-05-07 night).
  acePayout: { paidDate: "2026-05-07", amountCents: 17353 }, // $173.53

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
 *   balance, which matches the sheet's own "Total Ace Pot Balance: $165.47"
 *   (13900 + 100×200 − 17353).
 * - Reserves: openings.reservesOpeningCents + 220¢ × paidEntries + 2000¢ ×
 *   tag count − expenses.
 * - Total cash: sum of every fund above.
 */
export const REAL_2026_GOLDEN = {
  olpCents: { EARLY: 16000, MID: 9600, LATE: 0 }, // $160 / $96 / $0
  skinsCents: { A: 47787, B: 23893 }, // $477.87 / $238.93
  aceCents: 16547, // $165.47 (matches sheet's Total Ace Pot Balance)
  reservesCents: 10912, // $109.12
  totalCashCents: 124739, // $1,247.39 (Σ funds)
} as const;

/** Fixture-level entry-count totals across all recorded nights — a
 * sanity check that the per-night rows above were transcribed correctly. */
export const REAL_2026_TOTALS = {
  paidEntries: 256,
  aceEntries: 200,
} as const;
