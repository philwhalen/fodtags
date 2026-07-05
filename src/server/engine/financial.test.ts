// Priority test (CLAUDE.md "Testing priorities"; Spec 09 §9.2.2): the
// financial engine must reproduce hand-calculated splits and reconciliation
// invariants in cents. Pure — no DB, no clock, no `server-only`.
import { describe, expect, it } from "vitest";

import { computeFinancials, splitSkinsCents } from "@server/engine/financial";
import { computeSeason } from "@server/engine/season";
import type { SeasonSnapshot, SeasonSnapshotFinancial, SubLeagueType } from "@/lib";

const SEASON_YEAR = 2026;

const ALL_INCOMPLETE: Record<SubLeagueType, boolean> = {
  EARLY: false,
  MID: false,
  LATE: false,
};

function emptyFinancial(overrides: Partial<SeasonSnapshotFinancial> = {}): SeasonSnapshotFinancial {
  return {
    openings: { aceCents: 0, reservesCents: 0 },
    nights: [],
    tagSales: [],
    payouts: [],
    expenses: [],
    adjustments: [],
    ...overrides,
  };
}

function sumFunds(funds: ReturnType<typeof computeFinancials>["funds"]): number {
  return (
    funds.reserves +
    funds.ace +
    funds.olp.EARLY +
    funds.olp.MID +
    funds.olp.LATE +
    funds.skins.A +
    funds.skins.B
  );
}

describe("splitSkinsCents", () => {
  it("splits 2800¢ (10 entries) into 1867¢ / 933¢ with no drift", () => {
    expect(splitSkinsCents(2800)).toEqual([1867, 933]);
    expect(1867 + 933).toBe(2800);
  });
});

describe("computeFinancials — worked night", () => {
  it("10 paid + 6 ace on EARLY yields the hand-calculated splits and net 6600¢", () => {
    const result = computeFinancials({
      seasonYear: SEASON_YEAR,
      subLeagueComplete: ALL_INCOMPLETE,
      financial: emptyFinancial({
        nights: [
          {
            eventId: 1,
            subLeagueType: "EARLY",
            eventDate: "2026-05-01",
            paidEntries: 10,
            aceEntries: 6,
          },
        ],
      }),
    });

    expect(result.funds.skins.A).toBe(1867);
    expect(result.funds.skins.B).toBe(933);
    expect(result.funds.skins.A + result.funds.skins.B).toBe(2800);
    expect(result.funds.olp.EARLY).toBe(1000);
    expect(result.funds.reserves).toBe(2200);
    expect(result.funds.ace).toBe(600);
    expect(result.totalCashCents).toBe(6600);
    expect(sumFunds(result.funds)).toBe(6600);

    const nightEntry = result.ledger.find((e) => e.kind === "league-night");
    expect(nightEntry?.netCents).toBe(6600);
    expect(nightEntry?.paidEntries).toBe(10);
    expect(nightEntry?.aceEntries).toBe(6);
  });
});

describe("computeFinancials — no-drift skins property", () => {
  it("skins A + B equals 280¢ × total paid entries exactly across odd counts", () => {
    const oddCounts = [1, 3, 7, 11, 13, 17, 19, 23];
    const result = computeFinancials({
      seasonYear: SEASON_YEAR,
      subLeagueComplete: ALL_INCOMPLETE,
      financial: emptyFinancial({
        nights: oddCounts.map((paidEntries, index) => ({
          eventId: index + 1,
          subLeagueType: "EARLY" as const,
          eventDate: `2026-05-${String(index + 1).padStart(2, "0")}`,
          paidEntries,
          aceEntries: 0,
        })),
      }),
    });

    const totalPaid = oddCounts.reduce((acc, n) => acc + n, 0);
    expect(result.funds.skins.A + result.funds.skins.B).toBe(280 * totalPaid);

    for (const entry of result.ledger.filter((e) => e.kind === "league-night")) {
      const skinsA = entry.deltas.find((d) => d.fund === "skins:A")?.cents ?? 0;
      const skinsB = entry.deltas.find((d) => d.fund === "skins:B")?.cents ?? 0;
      expect(skinsA + skinsB).toBe(280 * (entry.paidEntries ?? 0));
    }
  });
});

describe("computeFinancials — reconciliation invariants", () => {
  it("every league-night satisfies paid×600 == skinsA+skinsB+olp+reserves", () => {
    const result = computeFinancials({
      seasonYear: SEASON_YEAR,
      subLeagueComplete: ALL_INCOMPLETE,
      financial: emptyFinancial({
        nights: [
          { eventId: 1, subLeagueType: "EARLY", eventDate: "2026-05-01", paidEntries: 10, aceEntries: 6 },
          { eventId: 2, subLeagueType: "MID", eventDate: "2026-06-01", paidEntries: 7, aceEntries: 3 },
          { eventId: 3, subLeagueType: "LATE", eventDate: "2026-08-01", paidEntries: 13, aceEntries: 0 },
        ],
      }),
    });

    for (const entry of result.ledger.filter((e) => e.kind === "league-night")) {
      const paid = entry.paidEntries ?? 0;
      const skinsA = entry.deltas.find((d) => d.fund === "skins:A")?.cents ?? 0;
      const skinsB = entry.deltas.find((d) => d.fund === "skins:B")?.cents ?? 0;
      const olp = entry.deltas
        .filter((d) => d.fund.startsWith("olp:"))
        .reduce((acc, d) => acc + d.cents, 0);
      const reserves = entry.deltas.find((d) => d.fund === "reserves")?.cents ?? 0;
      expect(paid * 600).toBe(skinsA + skinsB + olp + reserves);
    }

    const lastRunning = result.ledger.at(-1)?.runningTotalCents ?? 0;
    expect(sumFunds(result.funds)).toBe(result.totalCashCents);
    expect(sumFunds(result.funds)).toBe(lastRunning);
  });
});

describe("computeFinancials — OLP cross-check", () => {
  it("olp fund inflow equals olpPot × 100 when run through computeSeason", () => {
    const snapshot: SeasonSnapshot = {
      seasonYear: SEASON_YEAR,
      holders: [],
      poolSwitches: [],
      ratings: [],
      subLeagues: [
        { type: "EARLY", startDate: "2026-05-01", endDate: "2026-06-01", complete: false },
        { type: "MID", startDate: "2026-06-15", endDate: "2026-07-15", complete: false },
        { type: "LATE", startDate: "2026-08-01", endDate: "2026-09-01", complete: false },
      ],
      tournamentSourceCount: 2,
      events: [],
      entryCounts: [
        { subLeagueType: "EARLY", paidEntries: 37 },
        { subLeagueType: "MID", paidEntries: 22 },
      ],
      financial: emptyFinancial({
        nights: [
          { eventId: 1, subLeagueType: "EARLY", eventDate: "2026-05-01", paidEntries: 25, aceEntries: 0 },
          { eventId: 2, subLeagueType: "EARLY", eventDate: "2026-05-08", paidEntries: 12, aceEntries: 0 },
          { eventId: 3, subLeagueType: "MID", eventDate: "2026-06-15", paidEntries: 22, aceEntries: 0 },
        ],
      }),
    };

    const results = computeSeason(snapshot);
    expect(results.financials.funds.olp.EARLY).toBe(results.olpPot.EARLY * 100);
    expect(results.financials.funds.olp.MID).toBe(results.olpPot.MID * 100);
    expect(results.financials.funds.olp.LATE).toBe(0);
  });
});

describe("computeFinancials — ace, tag, expense, payout, adjustment", () => {
  it("moves each fund by the correct signed cents", () => {
    const result = computeFinancials({
      seasonYear: SEASON_YEAR,
      subLeagueComplete: ALL_INCOMPLETE,
      financial: emptyFinancial({
        openings: { aceCents: 500, reservesCents: 1000 },
        nights: [
          { eventId: 1, subLeagueType: "EARLY", eventDate: "2026-05-01", paidEntries: 5, aceEntries: 2 },
        ],
        tagSales: [{ id: 1, saleDate: "2026-04-15", count: 3 }],
        payouts: [
          {
            id: 1,
            kind: "ACE",
            paidDate: "2026-05-01",
            amountCents: 700,
            subLeague: null,
            pool: null,
            recipientHolderId: 1,
          },
          {
            id: 2,
            kind: "SKINS",
            paidDate: "2026-09-15",
            amountCents: 1400,
            subLeague: null,
            pool: "A",
            recipientHolderId: 1,
          },
        ],
        expenses: [
          {
            id: 1,
            spentDate: "2026-06-01",
            amountCents: 350,
            category: "pdga_fees",
            description: "PDGA sanction fee",
          },
        ],
        adjustments: [{ id: 1, fund: "olp:EARLY", deltaCents: -50, adjustedDate: "2026-05-02", reason: "correction" }],
      }),
    });

    // Opening: ace 500, reserves 1000
    // Night: ace +200 (2 ace), reserves +1100 (5×220), skins, olp
    // Tag: reserves +6000 (3×2000)
    // Ace win: ace -700
    // Skins payout: skins A -1400
    // Expense: reserves -350
    // Adjustment: olp EARLY -50

    const nightSkinsTotal = 280 * 5;
    const [skinsA] = splitSkinsCents(nightSkinsTotal);

    expect(result.funds.ace).toBe(500 + 200 - 700);
    expect(result.funds.reserves).toBe(1000 + 1100 + 6000 - 350);
    expect(result.funds.skins.A).toBe(skinsA - 1400);
    expect(result.funds.olp.EARLY).toBe(500 - 50);
    expect(result.skinsPaidOut.A).toBe(true);
    expect(result.skinsPaidOut.B).toBe(false);
  });
});

describe("computeFinancials — ordering and running totals", () => {
  it("sorts opening first on the same date and accumulates running totals", () => {
    const result = computeFinancials({
      seasonYear: SEASON_YEAR,
      subLeagueComplete: ALL_INCOMPLETE,
      financial: emptyFinancial({
        openings: { aceCents: 300, reservesCents: 700 },
        nights: [
          { eventId: 2, subLeagueType: "EARLY", eventDate: "2026-05-01", paidEntries: 1, aceEntries: 0 },
        ],
        tagSales: [{ id: 1, saleDate: "2026-05-01", count: 1 }],
      }),
    });

    expect(result.ledger[0]?.kind).toBe("opening");
    expect(result.ledger[0]?.date).toBe("2026-01-01");
    expect(result.ledger[0]?.runningTotalCents).toBe(1000);

    let expectedRunning = 0;
    for (const entry of result.ledger) {
      expectedRunning += entry.netCents;
      expect(entry.runningTotalCents).toBe(expectedRunning);
    }
    expect(result.ledger.at(-1)?.runningTotalCents).toBe(result.totalCashCents);
  });
});

describe("computeFinancials — missing financial", () => {
  it("yields zero funds, empty ledger, and projected true when sub-leagues incomplete", () => {
    const result = computeFinancials({
      seasonYear: SEASON_YEAR,
      subLeagueComplete: ALL_INCOMPLETE,
    });

    expect(result.ledger).toEqual([]);
    expect(result.totalCashCents).toBe(0);
    expect(sumFunds(result.funds)).toBe(0);
    expect(result.totals).toEqual({ tagSales: 0, paidEntries: 0, aceEntries: 0 });
    expect(result.projected).toBe(true);
  });
});
