import { filterRowsByName } from "./filter-rows";
import type { PoolSlug } from "./public-routes";
import { VALID_POOLS } from "./public-routes";
import type { Pool } from "./pool";
import type { EventType, SubLeagueType } from "./season-snapshot";

/**
 * One enriched line item on a holder's score sheet (Spec 07 §7.2/§7.3) —
 * the engine's `ScoreSheetLineItem` fields plus the repo-sourced label the
 * read-model build attaches (`listEvents` label/roundOrdinal join). `-1` is
 * the synthetic Podium eventId (Spec 02 §2.4.1) — never a stored event.
 */
export interface ScoreSheetViewLine {
  eventId: number;
  type: EventType | "Podium";
  subLeague?: SubLeagueType;
  /** ET calendar date, `YYYY-MM-DD`. */
  date: string;
  /** `event.label`; `""` for a Podium line (the display title is composed
   * from `subLeague` instead — see `composeTitle`). */
  label: string;
  /** League-Night round number for label composition; `null` when not
   * applicable (non-League-Night lines, or the label composes without it). */
  roundOrdinal: number | null;
  pool: Pool;
  rank: number;
  points: number;
  tieBrokenByTag: boolean;
  /** Present only on a dropped line — why it didn't count. */
  droppedReason?: "cap" | "forfeited";
}

/** One holder's row on a pool's score sheet (Spec 07 §7.2). Order/rank come
 * straight from that pool's Championship standing. */
export interface PublicScoreSheetHolder {
  holderId: number;
  name: string;
  slug: string;
  tagNumber: number | null;
  rank: number;
  tieBrokenByTag: boolean;
  byType: Record<EventType | "Podium", number>;
  /** === the Championship total for this holder (Spec 07 §7.2
   * reconciliation invariant). */
  total: number;
  counted: ScoreSheetViewLine[];
  dropped: ScoreSheetViewLine[];
  /** Not-yet-final Podium line(s) for an incomplete sub-league — excluded
   * from every subtotal and from `total` (Spec 07 §7.2 Decision 1). */
  projectedPodium: ScoreSheetViewLine[];
}

/** The active top-N caps stated on the page (Spec 07 §7.3). */
export interface ScoreSheetCaps {
  leagueNight: number;
  tournament: number;
  tournamentSourceCount: number;
  fodOpen: number;
}

/** Published payload for one `score-sheet/pool-*` view. */
export interface PublicScoreSheetPayload {
  pool: Pool;
  /** Championship order for this pool. */
  holders: PublicScoreSheetHolder[];
  caps: ScoreSheetCaps;
  updatedAt: string;
  stale: boolean;
  pendingReview: number;
}

/** One display-ready line within a holder's detail (Spec 07 §7.2). */
export interface DisplayLine {
  /** Stable React key: `${type}:${eventId}:${date}`. */
  key: string;
  title: string;
  /** `"{ordinal} (Pool {A|B})"`, e.g. `"1st (Pool A)"`. */
  finish: string;
  points: number;
  tieBrokenByTag: boolean;
  /** Present on dropped/projected lines only. */
  reason?: string;
  /** True for a not-yet-final Podium line. */
  projected?: boolean;
}

/** One event-type group within a holder's detail, in fixed display order. */
export interface ScoreSheetLineGroup {
  type: EventType | "Podium";
  /** Group heading text, via `capLabel`. */
  label: string;
  counted: DisplayLine[];
  dropped: DisplayLine[];
}

/** One holder's fully projected detail. */
export interface ScoreSheetHolderView {
  holder: PublicScoreSheetHolder;
  /** LeagueNight, Podium, Tournament, FODOpen — always in this order. */
  groups: ScoreSheetLineGroup[];
  /** True when this holder has at least one dropped line (drives the
   * per-player "show all" expander, Spec 07 §7.3). */
  hasDropped: boolean;
}

/** The result of projecting a `PublicScoreSheetPayload` for display. */
export interface ScoreSheetProjection {
  pool: Pool;
  caps: ScoreSheetCaps;
  holders: ScoreSheetHolderView[];
}

/** Fixed display order for a holder's per-type groups (Spec 07 §7.2). */
const GROUP_ORDER: (EventType | "Podium")[] = [
  "LeagueNight",
  "Podium",
  "Tournament",
  "FODOpen",
];

const SUB_LEAGUE_ORDER: Record<SubLeagueType, number> = {
  EARLY: 0,
  MID: 1,
  LATE: 2,
};

const SUB_LEAGUE_DISPLAY: Record<SubLeagueType, string> = {
  EARLY: "Early",
  MID: "Mid",
  LATE: "Late",
};

/** `1 -> "1st"`, `2 -> "2nd"`, `3 -> "3rd"`, `4 -> "4th"`, `11 -> "11th"`,
 * `21 -> "21st"` — the standard English ordinal suffix, including the
 * 11/12/13 teens exception. */
function ordinal(n: number): string {
  const remainder100 = n % 100;
  if (remainder100 >= 11 && remainder100 <= 13) {
    return `${n}th`;
  }
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function composeTitle(line: ScoreSheetViewLine): string {
  if (line.eventId === -1) {
    const subLeague = line.subLeague ? SUB_LEAGUE_DISPLAY[line.subLeague] : "";
    return `${subLeague} Podium`;
  }
  if (line.type === "LeagueNight" && line.roundOrdinal !== null) {
    return `${line.label} Round ${line.roundOrdinal} · ${line.date}`;
  }
  return `${line.label} · ${line.date}`;
}

function reasonForDropped(
  line: ScoreSheetViewLine,
  caps: ScoreSheetCaps,
): string | undefined {
  if (line.droppedReason === "forfeited") {
    return "forfeited on pool switch";
  }
  if (line.droppedReason === "cap") {
    if (line.type === "LeagueNight") {
      return "beyond best 15";
    }
    if (line.type === "Tournament") {
      return `beyond best ${caps.tournament}`;
    }
  }
  return undefined;
}

/** Sort order within a group: `Podium` lines sort by sub-league order
 * (EARLY/MID/LATE); every other type sorts by `date` ascending. */
function compareLines(
  a: ScoreSheetViewLine,
  b: ScoreSheetViewLine,
  type: EventType | "Podium",
): number {
  if (type === "Podium") {
    const orderA = a.subLeague ? SUB_LEAGUE_ORDER[a.subLeague] : 99;
    const orderB = b.subLeague ? SUB_LEAGUE_ORDER[b.subLeague] : 99;
    return orderA - orderB;
  }
  return a.date.localeCompare(b.date);
}

function toDisplayLine(
  line: ScoreSheetViewLine,
  options: { reason?: string; projected?: boolean } = {},
): DisplayLine {
  const display: DisplayLine = {
    key: `${line.type}:${line.eventId}:${line.date}`,
    title: composeTitle(line),
    finish: `${ordinal(line.rank)} (Pool ${line.pool})`,
    points: line.points,
    tieBrokenByTag: line.tieBrokenByTag,
  };
  if (options.reason !== undefined) {
    display.reason = options.reason;
  }
  if (options.projected) {
    display.projected = true;
  }
  return display;
}

function buildGroup(
  type: EventType | "Podium",
  holder: PublicScoreSheetHolder,
  caps: ScoreSheetCaps,
): ScoreSheetLineGroup {
  const counted = holder.counted
    .filter((line) => line.type === type)
    .slice()
    .sort((a, b) => compareLines(a, b, type))
    .map((line) => toDisplayLine(line));

  const droppedEntries = holder.dropped
    .filter((line) => line.type === type)
    .map((line) => ({ line, reason: reasonForDropped(line, caps), projected: false }));

  // Projected (not-yet-final) Podium lines fold into the Podium group's
  // `dropped` array — de-emphasized like a dropped line, flagged
  // `projected`, and excluded from every subtotal/total (Spec 07 §7.2
  // Decision 1).
  const projectedEntries =
    type === "Podium"
      ? holder.projectedPodium.map((line) => ({
          line,
          reason: "projected — not final",
          projected: true,
        }))
      : [];

  const dropped = [...droppedEntries, ...projectedEntries]
    .slice()
    .sort((a, b) => compareLines(a.line, b.line, type))
    .map(({ line, reason, projected }) => toDisplayLine(line, { reason, projected }));

  return {
    type,
    label: capLabel(type, caps),
    counted,
    dropped,
  };
}

function projectHolder(
  holder: PublicScoreSheetHolder,
  caps: ScoreSheetCaps,
): ScoreSheetHolderView {
  return {
    holder,
    groups: GROUP_ORDER.map((type) => buildGroup(type, holder, caps)),
    hasDropped: holder.dropped.length > 0,
  };
}

/**
 * Projects a `score-sheet/pool-*` read-model payload into the grouped,
 * label-composed detail the page renders (Spec 07 §7.2). Groups are always
 * emitted in the fixed `LeagueNight, Podium, Tournament, FODOpen` order;
 * lines within a group are sorted deterministically regardless of input
 * order. Every counted line contributes to `holder.total` / `holder.byType`
 * (already true of the incoming payload — this function never re-sums);
 * projected-Podium lines are display-only and never counted.
 */
export function projectScoreSheet(
  payload: PublicScoreSheetPayload,
): ScoreSheetProjection {
  return {
    pool: payload.pool,
    caps: payload.caps,
    holders: payload.holders.map((holder) => projectHolder(holder, payload.caps)),
  };
}

/** Group heading text stating the active cap (Spec 07 §7.3), e.g.
 * `"Tournaments (best 2 of 3)"` once 4+ sanctioned tournaments are
 * registered the cap rises to 3 and the text updates automatically. */
export function capLabel(type: EventType | "Podium", caps: ScoreSheetCaps): string {
  switch (type) {
    case "LeagueNight":
      return "League Nights (best 15)";
    case "Podium":
      return "League Podium";
    case "Tournament":
      return `Tournaments (best ${caps.tournament} of ${caps.tournamentSourceCount})`;
    case "FODOpen":
      return "FOD Open";
  }
}

/**
 * Pure link builder for the pool toggle (mirrors `buildOlpLinks`). Unlike
 * OLP/sub-league there is no "current" alias — nav already deep-links
 * `pool-a`.
 */
export function buildScoreSheetLinks(season: string): Record<PoolSlug, string> {
  return Object.fromEntries(
    VALID_POOLS.map((slug) => [slug, `/${season}/score-sheet/${slug}`]),
  ) as Record<PoolSlug, string>;
}

/**
 * Client-side name filter over already-projected holders (Spec 07 §7.5) —
 * thin reuse of `filterRowsByName`; never re-orders (order is Championship
 * rank).
 */
export function filterScoreSheetHolders(
  holders: PublicScoreSheetHolder[],
  query: string,
): PublicScoreSheetHolder[] {
  return filterRowsByName(holders, query);
}
