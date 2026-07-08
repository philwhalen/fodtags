// Shared, server-free "engine input" contract (Spec 02;
// plans/common-a/02-engine-scoring.md). This is the AUTHORITATIVE
// `SeasonSnapshot` shape: `computeSeason` (src/server/engine/season.ts)
// takes exactly this plain object. It deliberately does NOT import
// `src/server/db/repositories/seasonSnapshot.ts` (a first-cut I/O loader
// from sub-plan 01, which returns DB-row-shaped types) — sub-plan 04
// reshapes that loader's return value to build *this* type instead.
import type { Pool } from "./pool";

/** Which of the three season sub-leagues (Spec 02 §2.1) a row belongs to. */
export type SubLeagueType = "EARLY" | "MID" | "LATE";

/**
 * The category of registered PDGA source an event belongs to (Spec 03
 * §3.4): the three sub-leagues plus season-wide TOURNAMENT and FOD_OPEN
 * sources. Distinct from `EventType` below — a `LeagueNight` event always
 * belongs to exactly one `SubLeagueType` source; `Tournament`/`FODOpen`
 * events belong to the TOURNAMENT/FOD_OPEN category. Drives Podium
 * grouping and the top-N cap bucketing.
 */
export type EventSourceCategory = SubLeagueType | "TOURNAMENT" | "FOD_OPEN";

/** Scored-event type (Spec 02 §2.1). Podium is never a stored/ingested
 * event — the engine computes it from sub-league standings (§2.4.1). */
export type EventType = "LeagueNight" | "Tournament" | "FODOpen";

export interface SeasonSnapshotHolder {
  id: number;
  /** The holder's INITIAL (stable) tag — admin-set; seeds the nightly tag
   * reassignment timeline (Spec 02 §2.10) and does not change as tags
   * churn night to night (see the engine's `currentTagNumber` output for
   * that). Null for a provisional (auto-added, not-yet-confirmed) holder —
   * Spec 03 §3.5/§3.6. Sorts last via `tagSortKey` (Spec 02 §2.6) wherever
   * a tag-in/tag-out number drives a tie-break before the timeline exists. */
  tagNumber: number | null;
  /** Pool at initial entry (Spec 02 §2.2); `poolSwitches` may move a
   * holder from here over the course of the season. */
  basePool: Pool;
  /** The tag purchase date (Spec 02 §2.3). May be a bare `YYYY-MM-DD` or a
   * full ISO date-time — the engine normalizes to calendar-date precision
   * before comparing it against event/effective dates. */
  entryDate: string;
  pdgaNumber: number | null;
  pdgaMembership: boolean;
  /** Official PDGA rating at first entry — the source of the Pool A/B
   * eligibility test (Spec 02 §2.2: "<900 rated at first entry"). */
  ratingAtEntry: number | null;
  active: boolean;
}

/** Director override of a holder's observed tag-out for one League Night
 * (Spec 02 §2.10, Spec 10 §10.9) — the only new admin INPUT the tag
 * reassignment feature adds; the pure timeline pre-pass (sub-plan 02)
 * applies these over whatever it would otherwise compute. */
export interface SeasonSnapshotTagOverride {
  eventId: number;
  holderId: number;
  /** The observed tag the holder left this night with. */
  tagOut: number;
}

export interface SeasonSnapshotPoolSwitch {
  holderId: number;
  /** ET calendar date, `YYYY-MM-DD`. All points earned strictly before
   * this date are forfeited (Spec 02 §2.2). */
  effectiveDate: string;
  toPool: Pool;
}

export interface SeasonSnapshotRating {
  holderId: number;
  /** ET calendar date, `YYYY-MM-DD`. */
  effectiveDate: string;
  rating: number;
  /** Only `official` ratings gate eligibility (Spec 02 §2.2); unofficial
   * (live per-round) ratings are display-only and ignored by the engine. */
  official: boolean;
}

export interface SeasonSnapshotSubLeague {
  type: SubLeagueType;
  /** ET calendar date, `YYYY-MM-DD`, or null if not yet admin-configured. */
  startDate: string | null;
  /** ET calendar date, `YYYY-MM-DD` — also the OLP "last day" (Spec 02
   * §2.8); or null if not yet admin-configured. */
  endDate: string | null;
  /** Admin flag: folds the computed Podium into the Championship total
   * (Spec 02 §2.4.1) once true. */
  complete: boolean;
}

export interface SeasonSnapshotEventResult {
  /** Null for a non-tag-holder entrant — excluded from ranking/points
   * entirely (Spec 02 §2.4: "ignoring non-tag-holders"). */
  holderId: number | null;
  rawScoreToPar: number;
  roundRating: number | null;
  /** False when the holder's tag was not physically present — excludes
   * this result from points/ranking (Spec 02 §2.3), even though the
   * holder played. */
  tagPresent: boolean;
}

export interface SeasonSnapshotEvent {
  id: number;
  /** EARLY/MID/LATE for a LeagueNight; TOURNAMENT or FOD_OPEN otherwise. */
  sourceType: EventSourceCategory;
  type: EventType;
  /** ET calendar date, `YYYY-MM-DD`. */
  eventDate: string;
  /** The PDGA round number for a League Night; null for a single-event
   * source (Tournament/FOD Open). */
  roundOrdinal: number | null;
  /** Admin-set: zero points everywhere, including OLP round counts, when
   * true (Spec 02 §2.7). */
  canceled: boolean;
  results: SeasonSnapshotEventResult[];
}

export interface SeasonSnapshotEntryCount {
  subLeagueType: SubLeagueType;
  paidEntries: number;
}

/** Fund identifier for ledger deltas and adjustments (Spec 09 §9.2.1). */
export type FundId =
  | "reserves"
  | "ace"
  | "olp:EARLY"
  | "olp:MID"
  | "olp:LATE"
  | "skins:A"
  | "skins:B";

export type ExpenseCategory = "pdga_fees" | "trophies" | "ctp" | "contingency" | "other";

/** One recorded League Night's cash facts (Spec 09 §9.2). */
export interface SeasonSnapshotNight {
  eventId: number;
  subLeagueType: SubLeagueType;
  /** ET calendar date, `YYYY-MM-DD`. */
  eventDate: string;
  paidEntries: number;
  aceEntries: number;
}

export interface SeasonSnapshotTagSale {
  id: number;
  /** ET calendar date, `YYYY-MM-DD`. */
  saleDate: string;
  count: number;
}

export interface SeasonSnapshotPayout {
  id: number;
  kind: "OLP" | "SKINS" | "ACE";
  /** ET calendar date, `YYYY-MM-DD`. */
  paidDate: string;
  amountCents: number;
  subLeague: SubLeagueType | null;
  pool: Pool | null;
  recipientHolderId: number | null;
}

export interface SeasonSnapshotExpense {
  id: number;
  /** ET calendar date, `YYYY-MM-DD`. */
  spentDate: string;
  amountCents: number;
  category: ExpenseCategory;
  description: string;
}

export interface SeasonSnapshotAdjustment {
  id: number;
  fund: FundId;
  deltaCents: number;
  /** ET calendar date, `YYYY-MM-DD`. */
  adjustedDate: string;
  reason: string;
}

/** Admin-entered financial facts for the season ledger (Spec 09 §9.2). */
export interface SeasonSnapshotFinancial {
  openings: { aceCents: number; reservesCents: number };
  nights: SeasonSnapshotNight[];
  tagSales: SeasonSnapshotTagSale[];
  payouts: SeasonSnapshotPayout[];
  expenses: SeasonSnapshotExpense[];
  adjustments: SeasonSnapshotAdjustment[];
}

/**
 * The pure `computeSeason` engine's entire input — a plain object with no
 * DB row types, assembled by a sub-plan-04 loader from the normalized
 * store. See plans/common-a/02-engine-scoring.md.
 */
export interface SeasonSnapshot {
  seasonYear: number;
  holders: SeasonSnapshotHolder[];
  poolSwitches: SeasonSnapshotPoolSwitch[];
  /** Director corrections to the engine-computed nightly tag-out (Spec 02
   * §2.10) — consumed by the timeline pre-pass (sub-plan 02). */
  tagOverrides: SeasonSnapshotTagOverride[];
  ratings: SeasonSnapshotRating[];
  subLeagues: SeasonSnapshotSubLeague[];
  /** Count of registered TOURNAMENT sources for the season — derives the
   * best-2-vs-best-3 tournament cap (Spec 02 §2.5). */
  tournamentSourceCount: number;
  events: SeasonSnapshotEvent[];
  /** Consumed by sub-plan 03 (OLP pot payout); carried through the
   * snapshot contract now so it doesn't need reshaping later. */
  entryCounts: SeasonSnapshotEntryCount[];
  /** Admin-entered financial facts (Spec 09 §9.2). When absent, Stage H
   * treats every slice as empty and yields zero fund balances. */
  financial?: SeasonSnapshotFinancial;
}
