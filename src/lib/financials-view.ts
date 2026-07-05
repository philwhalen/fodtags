import { formatCents } from "./money";
import type { PoolSlug, SubLeagueSlug } from "./public-routes";
import type { Pool } from "./pool";
import type { ExpenseCategory, FundId, SubLeagueType } from "./season-snapshot";
import type {
  FundDelta,
  LedgerEntry,
  LedgerEntryKind,
  SeasonFinancials,
} from "./season-results";

/**
 * Published payload for the single `financials` view (Spec 09 §9.3) — the
 * whole engine `SeasonFinancials` output plus the shared read-model
 * freshness fields (mirrors how the OLP/score-sheet payloads carry
 * freshness alongside their engine data).
 */
export interface PublicFinancialsPayload extends SeasonFinancials {
  updatedAt: string;
  stale: boolean;
  pendingReview: number;
}

export type FundStatus = "projected" | "final";

/** One fund-balance row in the `#summary` section. */
export interface FundBalanceRow {
  fund: FundId;
  label: string;
  amount: string;
  status: FundStatus;
}

export interface FinancialsSummaryView {
  fundRows: FundBalanceRow[];
  totalCash: { amount: string; status: FundStatus };
  totals: { tagSales: number; paidEntries: number; aceEntries: number };
}

/** One pool's skins purse in the `#pots-skins` section. */
export interface SkinsPotView {
  pool: Pool;
  label: string;
  purse: string;
  status: FundStatus;
  /** The season-end payout amount, once recorded. */
  payout?: string;
}

/** One sub-league's OLP pot in the `#pots-olp` section — the 50/30/20
 * largest-remainder split of the pot's gross accrual (Spec 02 §2.8),
 * independent of whether the payout has actually been recorded, so the
 * split stays meaningful both before and after payout. */
export interface OlpPotView {
  subLeague: SubLeagueType;
  label: string;
  pot: string;
  status: FundStatus;
  /** [1st, 2nd, 3rd] formatted dollar shares, summing to `pot`. */
  payouts: [string, string, string];
}

export interface AceWinView {
  date: string;
  amount: string;
  note?: string;
}

export interface AcePotView {
  balance: string;
  openingCarryover: string;
  ratePerEntry: string;
  wins: AceWinView[];
  status: FundStatus;
}

export interface PotsView {
  skins: SkinsPotView[];
  olp: OlpPotView[];
  ace: AcePotView;
}

/** One split child within an expanded league-night ledger row. */
export interface SplitChildView {
  label: string;
  amount: string;
}

/** One display-ready row in the `#ledger` section. */
export interface LedgerRowView {
  kind: LedgerEntryKind;
  date: string;
  title: string;
  netAmount: string;
  runningTotal: string;
  href?: string;
  detail?: string;
  splitChildren?: SplitChildView[];
}

export interface LedgerView {
  rows: LedgerRowView[];
}

const SUB_LEAGUE_TO_SLUG: Record<SubLeagueType, SubLeagueSlug> = {
  EARLY: "early",
  MID: "mid",
  LATE: "late",
};

const POOL_TO_SLUG: Record<Pool, PoolSlug> = {
  A: "pool-a",
  B: "pool-b",
};

const SUB_LEAGUE_DISPLAY: Record<SubLeagueType, string> = {
  EARLY: "Early",
  MID: "Mid",
  LATE: "Late",
};

const POOL_DISPLAY: Record<Pool, string> = {
  A: "Pool A",
  B: "Pool B",
};

const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  pdga_fees: "PDGA fees",
  trophies: "Trophies",
  ctp: "CTP",
  contingency: "Contingency",
  other: "Other",
};

/** $1.00 ace-pot buy-in per participating entrant (Spec 09 §9.1) — a fixed
 * display constant, not derived from the ledger. */
const ACE_RATE_PER_ENTRY_CENTS = 100;

/** Human label for a fund identifier (Spec 09 §9.2.1), used in the
 * `#summary` fund rows and in league-night split-child labels/opening
 * detail. */
export function fundLabel(fund: FundId): string {
  switch (fund) {
    case "reserves":
      return "Expense Reserves";
    case "ace":
      return "Ace Pot";
    case "olp:EARLY":
      return "OLP – Early";
    case "olp:MID":
      return "OLP – Mid";
    case "olp:LATE":
      return "OLP – Late";
    case "skins:A":
      return "Skins – Pool A";
    case "skins:B":
      return "Skins – Pool B";
  }
}

/**
 * Splits whole-dollar `pot` into 1st/2nd/3rd shares at 50%/30%/20% using the
 * largest-remainder method, so the three shares always sum exactly to
 * `pot` — the same routine `src/server/engine/olp.ts` (`largestRemainderPayout`,
 * Spec 02 §2.8) uses to pay out the OLP pot, replicated here (rather than
 * imported) so this module stays free of `src/server/` imports. Operates on
 * whole dollars, matching the OLP page's actual payout figures, **not**
 * cents — splitting the cents-denominated pot directly would divide evenly
 * every time (it's always a multiple of 100) and never exercise the
 * largest-remainder rounding the product actually relies on.
 */
function largestRemainderSplit(pot: number): [number, number, number] {
  const raw = [0.5 * pot, 0.3 * pot, 0.2 * pot];
  const floors = raw.map((r) => Math.floor(r));
  const distributed = floors.reduce((acc, f) => acc + f, 0);
  const remainder = Math.round(pot - distributed);

  const byRemainder = raw
    .map((r, index) => ({ index, fraction: r - Math.floor(r) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const shares = floors.slice();
  for (let k = 0; k < remainder; k++) {
    const slot = byRemainder[k];
    if (!slot) break;
    shares[slot.index] = (shares[slot.index] ?? 0) + 1;
  }

  return [shares[0] ?? 0, shares[1] ?? 0, shares[2] ?? 0];
}

function findDelta(deltas: FundDelta[], fund: FundId): FundDelta | undefined {
  return deltas.find((d) => d.fund === fund);
}

/** Gross cents ever contributed to `olp:<type>` via league-night entries —
 * independent of any payout already recorded — so the pots-detail 50/30/20
 * split stays meaningful whether or not the sub-league has paid out yet. */
function olpGrossPotCents(ledger: LedgerEntry[], type: SubLeagueType): number {
  const fund: FundId = `olp:${type}`;
  return ledger
    .filter((entry) => entry.kind === "league-night")
    .reduce((acc, entry) => {
      const delta = findDelta(entry.deltas, fund);
      return acc + (delta?.cents ?? 0);
    }, 0);
}

function openingAceCents(ledger: LedgerEntry[]): number {
  const opening = ledger.find((entry) => entry.kind === "opening");
  if (!opening) return 0;
  return findDelta(opening.deltas, "ace")?.cents ?? 0;
}

function buildSummary(payload: PublicFinancialsPayload): FinancialsSummaryView {
  const { funds, subLeagueComplete, skinsPaidOut, projected } = payload;
  const otherStatus: FundStatus = projected ? "projected" : "final";

  const fundRows: FundBalanceRow[] = [
    { fund: "reserves", label: fundLabel("reserves"), amount: formatCents(funds.reserves), status: otherStatus },
    { fund: "ace", label: fundLabel("ace"), amount: formatCents(funds.ace), status: otherStatus },
    ...(["EARLY", "MID", "LATE"] as SubLeagueType[]).map((type) => {
      const fund: FundId = `olp:${type}`;
      return {
        fund,
        label: fundLabel(fund),
        amount: formatCents(funds.olp[type]),
        status: (subLeagueComplete[type] ? "final" : "projected") as FundStatus,
      };
    }),
    ...(["A", "B"] as Pool[]).map((pool) => {
      const fund: FundId = `skins:${pool}`;
      return {
        fund,
        label: fundLabel(fund),
        amount: formatCents(funds.skins[pool]),
        status: (skinsPaidOut[pool] ? "final" : "projected") as FundStatus,
      };
    }),
  ];

  return {
    fundRows,
    totalCash: { amount: formatCents(payload.totalCashCents), status: otherStatus },
    totals: { ...payload.totals },
  };
}

function buildPots(payload: PublicFinancialsPayload): PotsView {
  const { funds, ledger, subLeagueComplete, skinsPaidOut } = payload;

  const skins: SkinsPotView[] = (["A", "B"] as Pool[]).map((pool) => {
    const payoutEntry = ledger.find(
      (entry) => entry.kind === "skins-payout" && findDelta(entry.deltas, `skins:${pool}`) !== undefined,
    );
    const view: SkinsPotView = {
      pool,
      label: POOL_DISPLAY[pool],
      purse: formatCents(funds.skins[pool]),
      status: skinsPaidOut[pool] ? "final" : "projected",
    };
    if (payoutEntry) {
      const delta = findDelta(payoutEntry.deltas, `skins:${pool}`);
      view.payout = formatCents(Math.abs(delta?.cents ?? 0));
    }
    return view;
  });

  const olp: OlpPotView[] = (["EARLY", "MID", "LATE"] as SubLeagueType[]).map((type) => {
    const potCents = olpGrossPotCents(ledger, type);
    // The pot is always a whole number of dollars (100¢ per entry, Spec
    // 09 §9.1), so this division is exact — split in whole dollars to
    // match the OLP page's actual payout figures (Spec 02 §2.8).
    const potDollars = potCents / 100;
    const [first, second, third] = largestRemainderSplit(potDollars);
    return {
      subLeague: type,
      label: SUB_LEAGUE_DISPLAY[type],
      pot: formatCents(potCents),
      status: subLeagueComplete[type] ? "final" : "projected",
      payouts: [formatCents(first * 100), formatCents(second * 100), formatCents(third * 100)],
    };
  });

  const wins: AceWinView[] = ledger
    .filter((entry) => entry.kind === "ace-win")
    .map((entry) => {
      const win: AceWinView = {
        date: entry.date,
        amount: formatCents(Math.abs(entry.netCents)),
      };
      if (entry.note) win.note = entry.note;
      return win;
    });

  const ace: AcePotView = {
    balance: formatCents(funds.ace),
    openingCarryover: formatCents(openingAceCents(ledger)),
    ratePerEntry: formatCents(ACE_RATE_PER_ENTRY_CENTS),
    wins,
    status: payload.projected ? "projected" : "final",
  };

  return { skins, olp, ace };
}

/** The sub-league carried by an entry's `olp:<TYPE>` delta, if any — used
 * for both league-night rows (contribution) and OLP-payout rows (payout),
 * since both carry exactly one `olp:` delta. */
function olpDeltaSubLeague(entry: LedgerEntry): SubLeagueType | undefined {
  const delta = entry.deltas.find((d) => d.fund.startsWith("olp:"));
  return delta ? (delta.fund.slice(4) as SubLeagueType) : undefined;
}

function payoutPool(entry: LedgerEntry): Pool | undefined {
  const delta = entry.deltas.find((d) => d.fund.startsWith("skins:"));
  return delta ? (delta.fund.slice(6) as Pool) : undefined;
}

function ledgerHref(entry: LedgerEntry, seasonYear: number): string | undefined {
  switch (entry.kind) {
    case "league-night": {
      const type = olpDeltaSubLeague(entry);
      if (!type) return undefined;
      return `/${seasonYear}/sub-league/${SUB_LEAGUE_TO_SLUG[type]}`;
    }
    case "olp-payout": {
      const type = olpDeltaSubLeague(entry);
      if (!type) return undefined;
      return `/${seasonYear}/olp/${SUB_LEAGUE_TO_SLUG[type]}`;
    }
    case "skins-payout": {
      const pool = payoutPool(entry);
      if (!pool) return undefined;
      return `/${seasonYear}/score-sheet/${POOL_TO_SLUG[pool]}`;
    }
    default:
      return undefined;
  }
}

function ledgerTitle(entry: LedgerEntry): string {
  switch (entry.kind) {
    case "opening":
      return "Opening balances";
    case "league-night": {
      const type = olpDeltaSubLeague(entry);
      const label = type ? SUB_LEAGUE_DISPLAY[type] : "";
      return `League Night · ${label}`;
    }
    case "tag-sale": {
      const count = entry.netCents / 2000;
      return `Tag sales ×${count}`;
    }
    case "olp-payout": {
      const type = olpDeltaSubLeague(entry);
      const label = type ? SUB_LEAGUE_DISPLAY[type] : "";
      return `${label} OLP payout`;
    }
    case "skins-payout": {
      const pool = payoutPool(entry);
      const label = pool ? POOL_DISPLAY[pool] : "";
      return `${label} Skins payout`;
    }
    case "ace-win":
      return "Ace pot payout";
    case "expense":
      return entry.category ? EXPENSE_CATEGORY_LABEL[entry.category] : "Expense";
    case "adjustment":
      return "Adjustment";
  }
}

function ledgerDetail(entry: LedgerEntry): string | undefined {
  switch (entry.kind) {
    case "expense": {
      const category = entry.category ? EXPENSE_CATEGORY_LABEL[entry.category] : "Expense";
      return entry.note ? `${category} — ${entry.note}` : category;
    }
    case "olp-payout":
    case "skins-payout":
    case "ace-win":
    case "adjustment":
      return entry.note;
    case "tag-sale": {
      const count = entry.netCents / 2000;
      return `${count} tag sale${count === 1 ? "" : "s"}`;
    }
    case "opening":
      return entry.deltas.map((d) => `${fundLabel(d.fund)} ${formatCents(d.cents)}`).join(", ");
    case "league-night":
      return undefined;
  }
}

function leagueNightSplitChildren(entry: LedgerEntry): SplitChildView[] {
  const order: { fund: FundId; label: string }[] = [
    { fund: "skins:A", label: "Skins A" },
    { fund: "skins:B", label: "Skins B" },
  ];
  const type = olpDeltaSubLeague(entry);
  if (type) {
    order.push({ fund: `olp:${type}`, label: "OLP" });
  }
  order.push({ fund: "reserves", label: "Reserves" });

  const children: SplitChildView[] = [];
  for (const { fund, label } of order) {
    const delta = findDelta(entry.deltas, fund);
    if (delta) children.push({ label, amount: formatCents(delta.cents) });
  }
  const aceDelta = findDelta(entry.deltas, "ace");
  if (aceDelta) children.push({ label: "Ace", amount: formatCents(aceDelta.cents) });
  return children;
}

function buildLedgerRow(entry: LedgerEntry, seasonYear: number): LedgerRowView {
  const row: LedgerRowView = {
    kind: entry.kind,
    date: entry.date,
    title: ledgerTitle(entry),
    netAmount: formatCents(entry.netCents),
    runningTotal: formatCents(entry.runningTotalCents),
  };

  const href = ledgerHref(entry, seasonYear);
  if (href) row.href = href;

  const detail = ledgerDetail(entry);
  if (detail !== undefined) row.detail = detail;

  if (entry.kind === "league-night") {
    row.splitChildren = leagueNightSplitChildren(entry);
  }

  return row;
}

function buildLedger(payload: PublicFinancialsPayload, seasonYear: number): LedgerView {
  return {
    // Preserve the engine's existing chronological order — never re-sort.
    rows: payload.ledger.map((entry) => buildLedgerRow(entry, seasonYear)),
  };
}

/**
 * Projects the `financials` read-model payload into the three section
 * models the `/{season}/financials` page renders (Spec 09 §9.3). Pure
 * function of `payload` (+ the season year, threaded through so ledger row
 * hrefs are season-correct) — no I/O, no clock, no re-sorting of the
 * engine's already-chronological ledger.
 */
export function projectFinancials(
  payload: PublicFinancialsPayload,
  seasonYear: number,
): { summary: FinancialsSummaryView; pots: PotsView; ledger: LedgerView } {
  return {
    summary: buildSummary(payload),
    pots: buildPots(payload),
    ledger: buildLedger(payload, seasonYear),
  };
}
