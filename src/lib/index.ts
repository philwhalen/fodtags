// Shared pure types/utils used by both the UI and the server. Unlike
// `src/server/`, this folder has no `server-only` guard — it's imported
// from client components too, so nothing server-only (secrets, DB, PDGA
// access) belongs here.

import type { Pool } from "./pool";

export type { Pool } from "./pool";
export {
  TAG_SALE_CENTS,
  centsToDollars,
  dollarsToCents,
  formatCents,
} from "./money";
export { normalizeName } from "./normalize-name";
export { todayEt } from "./date-et";
export { resolveCurrentSubLeague } from "./current-sub-league";
export type { SubLeagueWindow } from "./current-sub-league";
export { resolveAliasTarget } from "./alias-target";
export { buildLeaderboardLinks } from "./leaderboard-links";
export type { LeaderboardLinks, LeaderboardView } from "./leaderboard-links";
export { filterRowsByName } from "./filter-rows";
export { slugifyName } from "./slugify-name";
export {
  buildRoundsLinks,
  parseRoundsFilter,
  serializeRoundsFilter,
} from "./rounds-filter";
export type { RoundsLinks } from "./rounds-filter";
export {
  filterHolderRounds,
  filterRosterByName,
  roundTrendSeries,
  summarizeRoster,
} from "./rounds-projection";
export { sparklinePath, sparklineSummary } from "./sparkline";
export type {
  PublicRoundsPayload,
  RosterRow,
  RoundRow,
  RoundsFilter,
  RoundsHolderEntry,
  RoundTypeCode,
} from "./rounds-types";

// The `computeSeason` engine's input/output contract (Spec 02;
// plans/common-a/02-engine-scoring.md) — kept here rather than imported
// from `src/server/db/repositories/seasonSnapshot.ts` so the pure engine
// never has to reach into `src/server/`.
export type {
  EventSourceCategory,
  EventType,
  ExpenseCategory,
  FundId,
  SeasonSnapshot,
  SeasonSnapshotAdjustment,
  SeasonSnapshotEntryCount,
  SeasonSnapshotEvent,
  SeasonSnapshotEventResult,
  SeasonSnapshotExpense,
  SeasonSnapshotFinancial,
  SeasonSnapshotHolder,
  SeasonSnapshotNight,
  SeasonSnapshotPayout,
  SeasonSnapshotPoolSwitch,
  SeasonSnapshotRating,
  SeasonSnapshotSubLeague,
  SeasonSnapshotTagSale,
  SubLeagueType,
} from "./season-snapshot";
export type {
  FundBalancesCents,
  FundDelta,
  LedgerEntry,
  LedgerEntryKind,
  OlpRow,
  PodiumStanding,
  PoolSkins,
  PoolStandings,
  ScoreSheetEntry,
  ScoreSheetLineItem,
  SeasonFinancials,
  SeasonResults,
  SeasonStandingRow,
  SkinsRow,
} from "./season-results";

/** A single ranked row in a pool's leaderboard (Spec 04 §4.2 columns). */
export interface StandingRow {
  rank: number;
  playerId: number;
  name: string;
  tagNumber: number;
  points: number;
  pool: Pool;
}

/** Inputs to the OLP (Overall League Performance) formula, Spec 02 §2.8. */
export interface OlpInput {
  /** Official PDGA player rating on the sub-league's last day. */
  ratingOnLastDay: number;
  /** Mean strokes-relative-to-par across league rounds played in the sub-league. */
  avgScoreToPar: number;
  /** Number of league rounds played in the sub-league (canceled/unplayed rounds excluded). */
  roundsPlayed: number;
  /** Number of League-Night first-place pool finishes in the sub-league. */
  leagueNightPoolWins: number;
}

/**
 * Round to one decimal place for **display only**. OLP scores (and any
 * other engine output that needs the "to the tenth" presentation from
 * Spec 02 §2.8) carry full internal precision through computation; this
 * helper is applied at the read-model/UI edge, never inside the engine's
 * math itself.
 */
export function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Format a UTC ISO timestamp for display in US Eastern time, with an "ET"
 * suffix (Spec 03 §3.6 "store UTC, format ET at the edge"; Spec 04 §4.4
 * "Updated {time} ET"). Client-safe — no server imports, just `Intl`.
 */
export function formatEt(iso: string): string {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
  return `${formatted} ET`;
}

export type {
  PublicStandingsRow,
  PublicStandingsViewPayload,
  PublicSubLeagueMetaPayload,
} from "./standings-view";
export { buildOlpLinks, projectOlp } from "./olp-view";
export type { OlpProjection, PublicOlpPayload, PublicOlpRow } from "./olp-view";
export {
  buildScoreSheetLinks,
  capLabel,
  filterScoreSheetHolders,
  projectScoreSheet,
} from "./score-sheet-view";
export type {
  DisplayLine,
  PublicScoreSheetHolder,
  PublicScoreSheetPayload,
  ScoreSheetCaps,
  ScoreSheetHolderView,
  ScoreSheetLineGroup,
  ScoreSheetProjection,
  ScoreSheetViewLine,
} from "./score-sheet-view";
export {
  isValidPool,
  isValidSubLeague,
  placeholderRouteHrefs,
  poolLabel,
  publicNavItems,
  subLeagueLabel,
  VALID_POOLS,
  VALID_SUB_LEAGUES,
} from "./public-routes";
export type { PoolSlug, PublicNavItem, SubLeagueSlug } from "./public-routes";
export { fundLabel, projectFinancials } from "./financials-view";
export type {
  AcePotView,
  AceWinView,
  FinancialsSummaryView,
  FundBalanceRow,
  FundStatus,
  LedgerRowView,
  LedgerView,
  OlpPotView,
  PotsView,
  PublicFinancialsPayload,
  SkinsPotView,
  SplitChildView,
} from "./financials-view";
