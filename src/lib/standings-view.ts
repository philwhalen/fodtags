import type { StandingRow } from "@/lib";

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
