import type { SubLeagueType } from "./season-snapshot";

export type { SubLeagueType };

/**
 * A sub-league's admin-configured window (Spec 10 §10.3), as published in
 * the `sub-leagues` read-model meta view (`src/server/readmodel/build.ts`).
 * Structurally identical to `SeasonSnapshotSubLeague` (`src/lib/season-snapshot.ts`)
 * — kept as its own type here so this module has no dependency direction
 * requirement on the engine's snapshot contract.
 */
export interface SubLeagueWindow {
  type: SubLeagueType;
  /** ET calendar date, `YYYY-MM-DD`, or null if not yet admin-configured. */
  startDate: string | null;
  /** ET calendar date, `YYYY-MM-DD`, or null if not yet admin-configured. */
  endDate: string | null;
  complete: boolean;
}

interface DatedWindow {
  type: SubLeagueType;
  startDate: string;
  endDate: string;
}

function isDated(w: SubLeagueWindow): w is SubLeagueWindow & { startDate: string; endDate: string } {
  return w.startDate !== null && w.endDate !== null;
}

/**
 * Resolves "the current sub-league" (Spec 04 §4.3): the shared, pure,
 * request-time helper reused by both the Leaderboards toggle default and
 * the `/sub-league` alias redirect (and by OLP — Spec 06).
 *
 * Operates only on rows with both `startDate` and `endDate` configured;
 * rows with either date null are ignored entirely. String comparison is
 * valid because dates are zero-padded `YYYY-MM-DD` (total order, no `Date`
 * parsing needed).
 *
 * Resolution order:
 *   1. In-window: `startDate <= today <= endDate`. Windows are
 *      non-overlapping by admin contract; if they ever overlap, the
 *      earliest `startDate` wins.
 *   2. Else most-recently-ended: the greatest `endDate <= today` (the gap
 *      between two sub-leagues resolves to the just-ended one).
 *   3. Else pre-season (today is before all windows): the earliest
 *      `startDate`.
 *   4. No dated windows at all: `null` (caller falls back to a static
 *      default, e.g. `EARLY`).
 */
export function resolveCurrentSubLeague(subLeagues: SubLeagueWindow[], today: string): SubLeagueType | null {
  const dated: DatedWindow[] = subLeagues.filter(isDated).map((w) => ({
    type: w.type,
    startDate: w.startDate,
    endDate: w.endDate,
  }));

  if (dated.length === 0) {
    return null;
  }

  const inWindow = dated.filter((w) => w.startDate <= today && today <= w.endDate);
  if (inWindow.length > 0) {
    return inWindow.reduce((earliest, w) => (w.startDate < earliest.startDate ? w : earliest)).type;
  }

  const ended = dated.filter((w) => w.endDate <= today);
  if (ended.length > 0) {
    return ended.reduce((latest, w) => (w.endDate > latest.endDate ? w : latest)).type;
  }

  return dated.reduce((earliest, w) => (w.startDate < earliest.startDate ? w : earliest)).type;
}
