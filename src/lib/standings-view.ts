import type { StandingRow } from "@/lib";
import type { SubLeagueWindow } from "./current-sub-league";

/** Published standings row (Spec 04 §4.2 + §2.6 tie-break flag). */
export interface PublicStandingsRow extends StandingRow {
  tieBrokenByTag: boolean;
}

/**
 * View-shaped payload for public standings pages. Mirrors
 * `StandingsViewPayload` in `src/server/readmodel/build.ts` without
 * importing server modules — public pages assert this shape at the
 * read-model repository edge.
 */
export interface PublicStandingsViewPayload {
  rows: PublicStandingsRow[];
  updatedAt: string;
  stale: boolean;
  pendingReview: number;
  /** Sub-league views only (Spec 04 §4.3). */
  finalized?: boolean;
}

/**
 * Published payload for the `sub-leagues` meta view (Spec 04 §4.3/§4.5):
 * the admin-configured windows for all three sub-leagues, used by public
 * routes/pages to resolve "current" at request time via
 * `resolveCurrentSubLeague` — never by reading `event_sources` directly.
 * Mirrors `SubLeagueMetaPayload` in `src/server/readmodel/build.ts`.
 */
export interface PublicSubLeagueMetaPayload {
  subLeagues: SubLeagueWindow[];
  updatedAt: string;
}
