// PURE MODULE — see src/server/engine/index.ts for the purity contract.
// No DB, no clock, no fetch, no Next.js, no `server-only`.
//
// Computes fund balances, the chronological ledger, and reconciliation
// facts from admin-entered financial inputs (Spec 09 §9.1–9.2).
import type {
  FundBalancesCents,
  FundDelta,
  FundId,
  LedgerEntry,
  LedgerEntryKind,
  Pool,
  SeasonFinancials,
  SeasonSnapshotFinancial,
  SeasonSnapshotNight,
  SubLeagueType,
} from "@/lib";

const SUB_LEAGUE_TYPES: SubLeagueType[] = ["EARLY", "MID", "LATE"];

/** Per-entry split constants in cents (Spec 09 §9.1). */
export const ENTRY_CENTS = 600;
export const SKINS_CENTS = 280;
export const OLP_CENTS = 100;
export const RESERVES_CENTS = 220;
export const ACE_CENTS = 100;
export const TAG_CENTS = 2000;

const KIND_ORDER: Record<LedgerEntryKind, number> = {
  opening: 0,
  "league-night": 1,
  "tag-sale": 2,
  "olp-payout": 3,
  "skins-payout": 4,
  "ace-win": 5,
  expense: 6,
  adjustment: 7,
};

type RawLedgerEntry = Omit<LedgerEntry, "netCents" | "runningTotalCents">;

/**
 * Splits a night's skins pool (280¢ × entries) 2/3 Pool A · 1/3 Pool B
 * using largest-remainder rounding so A + B equals `totalCents` exactly
 * (Spec 09 §9.2.2).
 */
export function splitSkinsCents(totalCents: number): [number, number] {
  const aCents = Math.round((totalCents * 2) / 3);
  return [aCents, totalCents - aCents];
}

function sumDeltas(deltas: FundDelta[]): number {
  return deltas.reduce((acc, d) => acc + d.cents, 0);
}

function sourceRefId(sourceRef: string): number {
  if (sourceRef === "opening") return 0;
  const colon = sourceRef.indexOf(":");
  if (colon === -1) return 0;
  const parsed = Number.parseInt(sourceRef.slice(colon + 1), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareLedgerEntries(a: RawLedgerEntry, b: RawLedgerEntry): number {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
  if (byKind !== 0) return byKind;
  return sourceRefId(a.sourceRef) - sourceRefId(b.sourceRef);
}

function emptyFunds(): FundBalancesCents {
  return {
    reserves: 0,
    ace: 0,
    olp: { EARLY: 0, MID: 0, LATE: 0 },
    skins: { A: 0, B: 0 },
  };
}

function sumFunds(funds: FundBalancesCents): number {
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

function applyDelta(funds: FundBalancesCents, fund: FundId, cents: number): void {
  if (fund === "reserves") {
    funds.reserves += cents;
    return;
  }
  if (fund === "ace") {
    funds.ace += cents;
    return;
  }
  if (fund.startsWith("olp:")) {
    const type = fund.slice(4) as SubLeagueType;
    funds.olp[type] += cents;
    return;
  }
  if (fund.startsWith("skins:")) {
    const pool = fund.slice(6) as Pool;
    funds.skins[pool] += cents;
  }
}

function foldDeltas(funds: FundBalancesCents, deltas: FundDelta[]): void {
  for (const delta of deltas) applyDelta(funds, delta.fund, delta.cents);
}

function leagueNightDeltas(night: SeasonSnapshotNight): FundDelta[] {
  const skinsTotal = SKINS_CENTS * night.paidEntries;
  const [skinsA, skinsB] = splitSkinsCents(skinsTotal);
  const deltas: FundDelta[] = [
    { fund: "skins:A", cents: skinsA },
    { fund: "skins:B", cents: skinsB },
    { fund: `olp:${night.subLeagueType}`, cents: OLP_CENTS * night.paidEntries },
    { fund: "reserves", cents: RESERVES_CENTS * night.paidEntries },
  ];
  if (night.aceEntries > 0) {
    deltas.push({ fund: "ace", cents: ACE_CENTS * night.aceEntries });
  }
  return deltas;
}

function buildLedgerEntries(
  seasonYear: number,
  financial: SeasonSnapshotFinancial,
): RawLedgerEntry[] {
  const entries: RawLedgerEntry[] = [];
  const { openings } = financial;

  const openingDeltas: FundDelta[] = [];
  if (openings.reservesCents !== 0) {
    openingDeltas.push({ fund: "reserves", cents: openings.reservesCents });
  }
  if (openings.aceCents !== 0) {
    openingDeltas.push({ fund: "ace", cents: openings.aceCents });
  }
  if (openingDeltas.length > 0) {
    entries.push({
      kind: "opening",
      date: `${seasonYear}-01-01`,
      sourceRef: "opening",
      deltas: openingDeltas,
    });
  }

  for (const night of financial.nights) {
    entries.push({
      kind: "league-night",
      date: night.eventDate,
      sourceRef: `event:${night.eventId}`,
      deltas: leagueNightDeltas(night),
      paidEntries: night.paidEntries,
      aceEntries: night.aceEntries,
    });
  }

  for (const sale of financial.tagSales) {
    entries.push({
      kind: "tag-sale",
      date: sale.saleDate,
      sourceRef: `tag-sale:${sale.id}`,
      deltas: [{ fund: "reserves", cents: TAG_CENTS * sale.count }],
    });
  }

  for (const payout of financial.payouts) {
    if (payout.kind === "OLP" && payout.subLeague) {
      entries.push({
        kind: "olp-payout",
        date: payout.paidDate,
        sourceRef: `payout:${payout.id}`,
        deltas: [{ fund: `olp:${payout.subLeague}`, cents: -payout.amountCents }],
      });
      continue;
    }
    if (payout.kind === "SKINS" && payout.pool) {
      entries.push({
        kind: "skins-payout",
        date: payout.paidDate,
        sourceRef: `payout:${payout.id}`,
        deltas: [{ fund: `skins:${payout.pool}`, cents: -payout.amountCents }],
      });
      continue;
    }
    if (payout.kind === "ACE") {
      entries.push({
        kind: "ace-win",
        date: payout.paidDate,
        sourceRef: `payout:${payout.id}`,
        deltas: [{ fund: "ace", cents: -payout.amountCents }],
      });
    }
  }

  for (const expense of financial.expenses) {
    entries.push({
      kind: "expense",
      date: expense.spentDate,
      sourceRef: `expense:${expense.id}`,
      deltas: [{ fund: "reserves", cents: -expense.amountCents }],
      category: expense.category,
      note: expense.description,
    });
  }

  for (const adjustment of financial.adjustments) {
    entries.push({
      kind: "adjustment",
      date: adjustment.adjustedDate,
      sourceRef: `adjustment:${adjustment.id}`,
      deltas: [{ fund: adjustment.fund, cents: adjustment.deltaCents }],
      note: adjustment.reason,
    });
  }

  return entries;
}

function finalizeLedger(rawEntries: RawLedgerEntry[]): LedgerEntry[] {
  const sorted = rawEntries.slice().sort(compareLedgerEntries);
  let runningTotalCents = 0;
  return sorted.map((entry) => {
    const netCents = sumDeltas(entry.deltas);
    runningTotalCents += netCents;
    return { ...entry, netCents, runningTotalCents };
  });
}

function computeSkinsPaidOut(financial: SeasonSnapshotFinancial): Record<Pool, boolean> {
  const skinsPaidOut: Record<Pool, boolean> = { A: false, B: false };
  for (const payout of financial.payouts) {
    if (payout.kind === "SKINS" && payout.pool) skinsPaidOut[payout.pool] = true;
  }
  return skinsPaidOut;
}

function emptyFinancials(subLeagueComplete: Record<SubLeagueType, boolean>): SeasonFinancials {
  const projected = SUB_LEAGUE_TYPES.some((type) => !subLeagueComplete[type]);
  return {
    funds: emptyFunds(),
    totalCashCents: 0,
    ledger: [],
    totals: { tagSales: 0, paidEntries: 0, aceEntries: 0 },
    subLeagueComplete,
    skinsPaidOut: { A: false, B: false },
    projected,
  };
}

/**
 * Computes fund balances, the chronological ledger, and reconciliation
 * facts from admin-entered financial inputs (Spec 09). Pure: the same
 * input always yields the same output, no I/O.
 */
export function computeFinancials(input: {
  seasonYear: number;
  financial?: SeasonSnapshotFinancial;
  subLeagueComplete: Record<SubLeagueType, boolean>;
}): SeasonFinancials {
  const { seasonYear, financial, subLeagueComplete } = input;
  const projected = SUB_LEAGUE_TYPES.some((type) => !subLeagueComplete[type]);

  if (!financial) return emptyFinancials(subLeagueComplete);

  const ledger = finalizeLedger(buildLedgerEntries(seasonYear, financial));
  const funds = emptyFunds();
  for (const entry of ledger) foldDeltas(funds, entry.deltas);

  const totals = {
    tagSales: financial.tagSales.reduce((acc, sale) => acc + sale.count, 0),
    paidEntries: financial.nights.reduce((acc, night) => acc + night.paidEntries, 0),
    aceEntries: financial.nights.reduce((acc, night) => acc + night.aceEntries, 0),
  };

  return {
    funds,
    totalCashCents: sumFunds(funds),
    ledger,
    totals,
    subLeagueComplete,
    skinsPaidOut: computeSkinsPaidOut(financial),
    projected,
  };
}
