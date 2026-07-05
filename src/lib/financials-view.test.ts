// Pure unit tests for the financials view projection (Spec 09 §9.2-9.4;
// plans/financials/01-pure-helpers.md).
import { describe, expect, it } from "vitest";

import { formatCents } from "./money";
import { fundLabel, projectFinancials } from "./financials-view";
import type { PublicFinancialsPayload } from "./financials-view";
import type { FundBalancesCents, LedgerEntry } from "./season-results";

const SEASON = 2026;

function emptyFunds(): FundBalancesCents {
  return {
    reserves: 0,
    ace: 0,
    olp: { EARLY: 0, MID: 0, LATE: 0 },
    skins: { A: 0, B: 0 },
  };
}

/** Builds a ledger the same way `finalizeLedger` in the engine does:
 * accepts entries without `runningTotalCents` and derives it by folding
 * `netCents` in the given (already-chronological) order. */
function ledgerFrom(
  entries: (Omit<LedgerEntry, "netCents" | "runningTotalCents"> & { netCents?: number })[],
): LedgerEntry[] {
  let running = 0;
  return entries.map((entry) => {
    const netCents = entry.netCents ?? entry.deltas.reduce((acc, d) => acc + d.cents, 0);
    running += netCents;
    return { ...entry, netCents, runningTotalCents: running };
  });
}

function fundsFromLedger(ledger: LedgerEntry[]): FundBalancesCents {
  const funds = emptyFunds();
  for (const entry of ledger) {
    for (const delta of entry.deltas) {
      if (delta.fund === "reserves") funds.reserves += delta.cents;
      else if (delta.fund === "ace") funds.ace += delta.cents;
      else if (delta.fund.startsWith("olp:")) {
        const type = delta.fund.slice(4) as "EARLY" | "MID" | "LATE";
        funds.olp[type] += delta.cents;
      } else if (delta.fund.startsWith("skins:")) {
        const pool = delta.fund.slice(6) as "A" | "B";
        funds.skins[pool] += delta.cents;
      }
    }
  }
  return funds;
}

function payload(
  ledgerEntries: (Omit<LedgerEntry, "netCents" | "runningTotalCents"> & { netCents?: number })[],
  overrides: Partial<PublicFinancialsPayload> = {},
): PublicFinancialsPayload {
  const ledger = ledgerFrom(ledgerEntries);
  const funds = fundsFromLedger(ledger);
  return {
    funds,
    totalCashCents:
      funds.reserves + funds.ace + funds.olp.EARLY + funds.olp.MID + funds.olp.LATE + funds.skins.A + funds.skins.B,
    ledger,
    totals: { tagSales: 0, paidEntries: 0, aceEntries: 0 },
    subLeagueComplete: { EARLY: false, MID: false, LATE: false },
    skinsPaidOut: { A: false, B: false },
    projected: true,
    updatedAt: "2026-06-01T00:00:00.000Z",
    stale: false,
    pendingReview: 0,
    ...overrides,
  };
}

function leagueNight(
  overrides: Partial<Omit<LedgerEntry, "netCents" | "runningTotalCents">> & {
    paidEntries: number;
    subLeague: "EARLY" | "MID" | "LATE";
    aceEntries?: number;
  },
): Omit<LedgerEntry, "netCents" | "runningTotalCents"> {
  const { paidEntries, subLeague, aceEntries = 0 } = overrides;
  const skinsTotal = 280 * paidEntries;
  const skinsA = Math.round((skinsTotal * 2) / 3);
  const skinsB = skinsTotal - skinsA;
  const deltas: LedgerEntry["deltas"] = [
    { fund: "skins:A", cents: skinsA },
    { fund: "skins:B", cents: skinsB },
    { fund: `olp:${subLeague}`, cents: 100 * paidEntries },
    { fund: "reserves", cents: 220 * paidEntries },
  ];
  if (aceEntries > 0) {
    deltas.push({ fund: "ace", cents: 100 * aceEntries });
  }
  return {
    kind: "league-night",
    date: overrides.date ?? "2026-05-01",
    sourceRef: overrides.sourceRef ?? "event:1",
    deltas,
    paidEntries,
    aceEntries,
  };
}

describe("projectFinancials — reconciliation", () => {
  it("total cash = sum of fund balances = last ledger runningTotalCents", () => {
    const p = payload([
      { kind: "opening", date: "2026-01-01", sourceRef: "opening", deltas: [
        { fund: "reserves", cents: 50000 },
        { fund: "ace", cents: 10000 },
      ] },
      leagueNight({ paidEntries: 10, subLeague: "EARLY", aceEntries: 8 }),
      { kind: "tag-sale", date: "2026-02-01", sourceRef: "tag-sale:1", deltas: [
        { fund: "reserves", cents: 2000 * 3 },
      ] },
    ]);

    const { summary } = projectFinancials(p, SEASON);
    const fundsSum =
      p.funds.reserves + p.funds.ace + p.funds.olp.EARLY + p.funds.olp.MID + p.funds.olp.LATE + p.funds.skins.A + p.funds.skins.B;
    expect(summary.totalCash.amount).toBe(formatCents(fundsSum));
    expect(summary.totalCash.amount).toBe(formatCents(p.totalCashCents));

    const lastRow = p.ledger[p.ledger.length - 1]!;
    expect(summary.totalCash.amount).toBe(formatCents(lastRow.runningTotalCents));
  });

  it("league-night split children sum to the row's netCents", () => {
    const p = payload([leagueNight({ paidEntries: 7, subLeague: "MID", aceEntries: 5 })]);
    const { ledger } = projectFinancials(p, SEASON);
    const row = ledger.rows[0]!;
    expect(row.splitChildren).toBeDefined();

    const centsFromFormatted = (s: string) => {
      const negative = s.startsWith("−");
      const clean = s.replace(/[−$]/g, "");
      const cents = Math.round(Number.parseFloat(clean) * 100);
      return negative ? -cents : cents;
    };
    const sum = row.splitChildren!.reduce((acc, c) => acc + centsFromFormatted(c.amount), 0);
    expect(sum).toBe(p.ledger[0]!.netCents);
  });

  it("league-night split children omit Ace when no ace entries recorded", () => {
    const p = payload([leagueNight({ paidEntries: 4, subLeague: "LATE", aceEntries: 0 })]);
    const { ledger } = projectFinancials(p, SEASON);
    const labels = ledger.rows[0]!.splitChildren!.map((c) => c.label);
    expect(labels).not.toContain("Ace");
    expect(labels).toEqual(["Skins A", "Skins B", "OLP", "Reserves"]);
  });
});

describe("projectFinancials — per-fund projected/final", () => {
  it("derives OLP/skins status per-fund and reserves/ace/total from `projected`", () => {
    const p = payload(
      [leagueNight({ paidEntries: 5, subLeague: "EARLY" }), leagueNight({ paidEntries: 5, subLeague: "MID" })],
      {
        subLeagueComplete: { EARLY: true, MID: false, LATE: false },
        skinsPaidOut: { A: true, B: false },
        projected: true,
      },
    );
    const { summary } = projectFinancials(p, SEASON);
    const byFund = Object.fromEntries(summary.fundRows.map((r) => [r.fund, r.status]));

    expect(byFund["olp:EARLY"]).toBe("final");
    expect(byFund["olp:MID"]).toBe("projected");
    expect(byFund["olp:LATE"]).toBe("projected");
    expect(byFund["skins:A"]).toBe("final");
    expect(byFund["skins:B"]).toBe("projected");
    expect(byFund.reserves).toBe("projected");
    expect(byFund.ace).toBe("projected");
    expect(summary.totalCash.status).toBe("projected");
  });

  it("everything is final once all sub-leagues complete, both pools paid, and projected=false", () => {
    const p = payload([leagueNight({ paidEntries: 5, subLeague: "EARLY" })], {
      subLeagueComplete: { EARLY: true, MID: true, LATE: true },
      skinsPaidOut: { A: true, B: true },
      projected: false,
    });
    const { summary, pots } = projectFinancials(p, SEASON);
    for (const row of summary.fundRows) {
      expect(row.status).toBe("final");
    }
    expect(summary.totalCash.status).toBe("final");
    expect(pots.ace.status).toBe("final");
    for (const s of pots.skins) expect(s.status).toBe("final");
    for (const o of pots.olp) expect(o.status).toBe("final");
  });
});

describe("projectFinancials — OLP 50-30-20 split", () => {
  it("shares are whole dollars, largest-remainder, and sum exactly to the pot", () => {
    // 10 paid entries -> $10 pot -> 1000 cents; 50/30/20 divides evenly.
    const p = payload([leagueNight({ paidEntries: 10, subLeague: "EARLY" })]);
    const { pots } = projectFinancials(p, SEASON);
    const early = pots.olp.find((o) => o.subLeague === "EARLY")!;
    expect(early.pot).toBe(formatCents(1000));
    expect(early.payouts).toEqual([formatCents(500), formatCents(300), formatCents(200)]);
  });

  it("an indivisible pot (e.g. $101) still sums exactly via largest-remainder", () => {
    // 101 paid entries -> $101 pot -> 10100 cents. Raw dollar shares: 50.5 / 30.3 / 20.2.
    // Floors: 50/30/20 = 100, remainder 1 dollar -> goes to largest fraction (50.5 -> 1st).
    const p = payload([leagueNight({ paidEntries: 101, subLeague: "MID" })]);
    const { pots } = projectFinancials(p, SEASON);
    const mid = pots.olp.find((o) => o.subLeague === "MID")!;
    expect(mid.pot).toBe(formatCents(10100));
    expect(mid.payouts).toEqual([formatCents(5100), formatCents(3000), formatCents(2000)]);

    const sumCents = mid.payouts.reduce((acc, s) => {
      const cents = Math.round(Number.parseFloat(s.replace(/[−$]/g, "")) * 100);
      return acc + cents;
    }, 0);
    expect(sumCents).toBe(10100);
  });

  it("pot reflects gross accrual, not the post-payout balance", () => {
    const p = payload([
      leagueNight({ paidEntries: 10, subLeague: "LATE" }),
      {
        kind: "olp-payout",
        date: "2026-09-01",
        sourceRef: "payout:1",
        deltas: [{ fund: "olp:LATE", cents: -1000 }],
        note: "season-end payout",
      },
    ]);
    const { pots } = projectFinancials(p, SEASON);
    const late = pots.olp.find((o) => o.subLeague === "LATE")!;
    // Fund balance is now 0 post-payout, but the pot shown is the gross $10.
    expect(p.funds.olp.LATE).toBe(0);
    expect(late.pot).toBe(formatCents(1000));
  });
});

describe("projectFinancials — ledger link hrefs", () => {
  it("league-night rows link to the sub-league leaderboard alias", () => {
    const p = payload([leagueNight({ paidEntries: 5, subLeague: "MID" })]);
    const { ledger } = projectFinancials(p, SEASON);
    expect(ledger.rows[0]!.href).toBe(`/${SEASON}/sub-league/mid`);
  });

  it("olp-payout rows link to /{season}/olp/{type}", () => {
    const p = payload([
      {
        kind: "olp-payout",
        date: "2026-09-01",
        sourceRef: "payout:1",
        deltas: [{ fund: "olp:EARLY", cents: -500 }],
      },
    ]);
    const { ledger } = projectFinancials(p, SEASON);
    expect(ledger.rows[0]!.href).toBe(`/${SEASON}/olp/early`);
  });

  it("skins-payout rows link to /{season}/score-sheet/pool-{a|b}", () => {
    const p = payload([
      {
        kind: "skins-payout",
        date: "2026-09-01",
        sourceRef: "payout:1",
        deltas: [{ fund: "skins:B", cents: -2000 }],
      },
    ]);
    const { ledger } = projectFinancials(p, SEASON);
    expect(ledger.rows[0]!.href).toBe(`/${SEASON}/score-sheet/pool-b`);
  });

  it("tag-sale/expense/ace-win/adjustment/opening rows have no href", () => {
    const p = payload([
      { kind: "opening", date: "2026-01-01", sourceRef: "opening", deltas: [{ fund: "reserves", cents: 100 }] },
      { kind: "tag-sale", date: "2026-02-01", sourceRef: "tag-sale:1", deltas: [{ fund: "reserves", cents: 2000 }] },
      {
        kind: "expense",
        date: "2026-03-01",
        sourceRef: "expense:1",
        deltas: [{ fund: "reserves", cents: -500 }],
        category: "trophies",
        note: "Season trophies",
      },
      {
        kind: "ace-win",
        date: "2026-04-01",
        sourceRef: "payout:2",
        deltas: [{ fund: "ace", cents: -5000 }],
        note: "Ace on hole 7",
      },
      {
        kind: "adjustment",
        date: "2026-05-01",
        sourceRef: "adjustment:1",
        deltas: [{ fund: "reserves", cents: 100 }],
        note: "correction",
      },
    ]);
    const { ledger } = projectFinancials(p, SEASON);
    for (const row of ledger.rows) {
      expect(row.href).toBeUndefined();
    }
  });
});

describe("projectFinancials — titles and details", () => {
  it("tag-sale title/detail derive the count from netCents / 2000", () => {
    const p = payload([
      { kind: "tag-sale", date: "2026-02-01", sourceRef: "tag-sale:1", deltas: [{ fund: "reserves", cents: 2000 * 4 }] },
    ]);
    const { ledger } = projectFinancials(p, SEASON);
    expect(ledger.rows[0]!.title).toBe("Tag sales ×4");
    expect(ledger.rows[0]!.detail).toBe("4 tag sales");
  });

  it("expense detail is 'category — description'", () => {
    const p = payload([
      {
        kind: "expense",
        date: "2026-03-01",
        sourceRef: "expense:1",
        deltas: [{ fund: "reserves", cents: -1234 }],
        category: "pdga_fees",
        note: "Annual sanctioning",
      },
    ]);
    const { ledger } = projectFinancials(p, SEASON);
    expect(ledger.rows[0]!.title).toBe("PDGA fees");
    expect(ledger.rows[0]!.detail).toBe("PDGA fees — Annual sanctioning");
  });

  it("opening title is 'Opening balances' with per-fund detail", () => {
    const p = payload([
      {
        kind: "opening",
        date: "2026-01-01",
        sourceRef: "opening",
        deltas: [
          { fund: "reserves", cents: 50000 },
          { fund: "ace", cents: 10000 },
        ],
      },
    ]);
    const { ledger } = projectFinancials(p, SEASON);
    expect(ledger.rows[0]!.title).toBe("Opening balances");
    expect(ledger.rows[0]!.detail).toBe(
      `${fundLabel("reserves")} ${formatCents(50000)}, ${fundLabel("ace")} ${formatCents(10000)}`,
    );
  });

  it("league-night rows have no `detail` (their detail is the split children)", () => {
    const p = payload([leagueNight({ paidEntries: 3, subLeague: "EARLY" })]);
    const { ledger } = projectFinancials(p, SEASON);
    expect(ledger.rows[0]!.detail).toBeUndefined();
  });
});

describe("projectFinancials — empty financials", () => {
  it("zeroed funds and empty ledger project without throwing", () => {
    const p = payload([]);
    const { summary, pots, ledger } = projectFinancials(p, SEASON);

    expect(summary.totalCash.amount).toBe("$0.00");
    for (const row of summary.fundRows) {
      expect(row.amount).toBe("$0.00");
    }
    expect(ledger.rows).toEqual([]);
    expect(pots.skins.every((s) => s.purse === "$0.00")).toBe(true);
    expect(pots.olp.every((o) => o.pot === "$0.00" && o.payouts.every((s) => s === "$0.00"))).toBe(true);
    expect(pots.ace.balance).toBe("$0.00");
    // Pre-season: `projected: true` by default in the `payload()` builder.
    expect(summary.totalCash.status).toBe("projected");
  });
});
