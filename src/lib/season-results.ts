// Shared, server-free "engine output" contract (Spec 02;
// plans/common-a/02-engine-scoring.md) — the counterpart to
// `season-snapshot.ts`. This sub-plan populates the standings/points/
// podium fields; sub-plan 03 adds OLP/skins via the placeholder fields
// below, so `computeSeason`'s return shape doesn't need reshaping later.
import type { Pool } from "./pool";
import type {
  EventType,
  ExpenseCategory,
  FundId,
  SubLeagueType,
} from "./season-snapshot";

/** A ranked row in a per-pool standing (Championship, sub-league, or
 * Podium) — Spec 02 §2.6 tie-break flag included so the UI can badge
 * ties resolved by tag number. */
export interface SeasonStandingRow {
  rank: number;
  holderId: number;
  tagNumber: number | null;
  pool: Pool;
  totalPoints: number;
  /** True when this row's rank was resolved by the low-tag-number
   * tie-break rather than a strict points difference (Spec 02 §2.6). */
  tieBrokenByTag: boolean;
}

/** A single scored appearance folded into a holder's score sheet (Spec
 * 07) — one per non-canceled, tag-present, post-entry-date event result,
 * plus a synthetic one per counted computed-Podium placement. */
export interface ScoreSheetLineItem {
  /** `-1` for a synthetic computed-Podium line item — Podium is never a
   * stored event (Spec 02 §2.4.1). */
  eventId: number;
  type: EventType | "Podium";
  subLeague?: SubLeagueType;
  /** ET calendar date, `YYYY-MM-DD`; the sub-league's `endDate` for a
   * Podium line item. */
  eventDate: string;
  pool: Pool;
  rank: number;
  points: number;
  tieBrokenByTag: boolean;
  /** Present only on a dropped item: why it didn't count toward the
   * Championship total — a top-N cap (Spec 02 §2.5) or pool-switch
   * forfeiture (Spec 02 §2.2). Absent on every item in
   * `countedLineItems`. */
  droppedReason?: "cap" | "forfeited";
}

export interface ScoreSheetEntry {
  byType: Record<EventType | "Podium", number>;
  countedLineItems: ScoreSheetLineItem[];
  droppedLineItems: ScoreSheetLineItem[];
  total: number;
}

export interface PodiumStanding {
  /** Mirrors the sub-league's admin `complete` flag: while false, this
   * standing is projected only and NOT folded into the Championship total
   * (Spec 02 §2.4.1). */
  complete: boolean;
  /** Top 3 per pool (or fewer, if the pool has under 3 participants). */
  A: SeasonStandingRow[];
  B: SeasonStandingRow[];
}

export interface PoolStandings {
  A: SeasonStandingRow[];
  B: SeasonStandingRow[];
}

/**
 * One holder's row in a sub-league's OLP standing (Spec 02 §2.8; Spec 06
 * §6.2). Ranked **across both pools together**, lowest `score` first.
 *
 * `ratingComponent` is the formula's `0.10 × rating` term (not the bare
 * rating) so the four displayed components — `ratingComponent`,
 * `avgToPar`, `rounds`, `poolWins` — literally sum/subtract to `score`,
 * per the "explain the number" principle (Spec 01 product principles).
 * Both `score` and `ratingComponent` carry full internal precision;
 * round to one decimal at the read-model/UI edge (`roundToOneDecimal`),
 * not here.
 */
export interface OlpRow {
  /** Rank within the sub-league's combined (both-pools) OLP field. */
  rank: number;
  holderId: number;
  tagNumber: number | null;
  /** Full-precision OLP score (lower is better). */
  score: number;
  /** `0.10 × ratingAsOfSubLeagueEndDate`, full precision. */
  ratingComponent: number;
  /** Mean score-to-par across played league rounds in this sub-league
   * (canceled/not-played rounds already excluded upstream). */
  avgToPar: number;
  /** Count of played league rounds in this sub-league (the `rounds`
   * subtrahend; canceled/not-played rounds excluded). */
  rounds: number;
  /** Count of League-Night first-place pool finishes in this sub-league
   * (the `poolWins` subtrahend). */
  poolWins: number;
  /** False when `rounds < 4` or the holder lacks PDGA membership (Spec 06
   * §6.2). Ineligible rows still appear here, but are excluded from
   * `payout`. */
  eligible: boolean;
  /** Dollar payout for ranks 1–3 among ELIGIBLE holders only (largest-
   * remainder split of `olpPot`, §2.8); `null` otherwise. */
  payout: number | null;
  /** True while the sub-league is not yet marked `complete` — the rating
   * component uses the latest official rating and payouts are
   * provisional (Spec 06 §6.4). */
  projected: boolean;
  /** True when this row's rank was resolved by the low-tag-number
   * tie-break rather than a strict score difference. */
  tieBrokenByTag: boolean;
}

/**
 * One holder's row in a pool's skins-qualification order (Spec 02 §2.9;
 * Spec 06). Rows are the pool's full Championship standing (by
 * `totalPoints`) so a passed-over qualifier's replacement is simply the
 * next `eligible` row after it.
 */
export interface SkinsRow {
  /** Standing rank within the pool (Championship total-points order). */
  rank: number;
  holderId: number;
  tagNumber: number | null;
  totalPoints: number;
  /** Always true for Pool A; for Pool B requires rating ≤920 as of the
   * end of the season (Spec 02 §2.9). Holders with no known rating are
   * treated as eligible (consistent with the engine's other rating-gate
   * fallbacks). */
  eligible: boolean;
  /** Top 4 **eligible** point earners in the pool, in rank order
   * (ineligible rows are skipped over, not counted against the 4). */
  qualified: boolean;
}

export interface PoolSkins {
  A: SkinsRow[];
  B: SkinsRow[];
}

/** Per-fund balances in integer cents (Spec 09 §9.2.1). */
export interface FundBalancesCents {
  reserves: number;
  ace: number;
  olp: Record<SubLeagueType, number>;
  skins: Record<Pool, number>;
}

/** A single fund's signed change on a ledger entry (+ inflow / − outflow). */
export interface FundDelta {
  fund: FundId;
  cents: number;
}

export type LedgerEntryKind =
  | "opening"
  | "league-night"
  | "tag-sale"
  | "olp-payout"
  | "skins-payout"
  | "ace-win"
  | "expense"
  | "adjustment";

/** One chronological row in the season financial ledger (Spec 09 §9.3). */
export interface LedgerEntry {
  kind: LedgerEntryKind;
  /** ET calendar date, `YYYY-MM-DD`. */
  date: string;
  /** `"opening"` | `"event:<id>"` | `"tag-sale:<id>"` | `"payout:<id>"` | … */
  sourceRef: string;
  deltas: FundDelta[];
  /** Sum of `deltas[].cents` — the change to total club cash. */
  netCents: number;
  /** Total club cash after this entry. */
  runningTotalCents: number;
  /** League-night only — for expandable display. */
  paidEntries?: number;
  aceEntries?: number;
  /** Expense description / payout note / adjustment reason. */
  note?: string;
  /** Expense only. */
  category?: ExpenseCategory;
}

/** Stage H output: fund balances, ledger, and reconciliation facts (Spec 09). */
export interface SeasonFinancials {
  funds: FundBalancesCents;
  /** Sum of all fund balances; equals the last ledger `runningTotalCents`. */
  totalCashCents: number;
  /** Chronological ledger with running total-club-cash balances. */
  ledger: LedgerEntry[];
  totals: { tagSales: number; paidEntries: number; aceEntries: number };
  subLeagueComplete: Record<SubLeagueType, boolean>;
  /** True once a season-end `SKINS` payout has been recorded for the pool. */
  skinsPaidOut: Record<Pool, boolean>;
  /** True while any sub-league is not yet marked complete. */
  projected: boolean;
}

/**
 * The pure `computeSeason` engine's output — standings/points/podium
 * (sub-plan 02) plus OLP scoring/payouts and skins qualification
 * (sub-plan 03, Spec 02 §2.8–2.9) and financials (Stage H, Spec 09).
 */
export interface SeasonResults {
  seasonYear: number;
  championship: PoolStandings;
  subLeagues: Record<SubLeagueType, PoolStandings>;
  scoreSheet: Record<number, ScoreSheetEntry>;
  podium: Record<SubLeagueType, PodiumStanding>;
  /** `$1 × paidEntries` for that sub-league (Spec 09 §9.1). */
  olpPot: Record<SubLeagueType, number>;
  /** OLP standing per sub-league, ranked across both pools together. */
  olp: Record<SubLeagueType, OlpRow[]>;
  /** Skins qualification order per pool (Spec 02 §2.9). */
  skins: PoolSkins;
  /** Fund balances, ledger, and reconciliation facts (Spec 09). */
  financials: SeasonFinancials;
}
