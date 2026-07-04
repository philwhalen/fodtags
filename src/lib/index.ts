// Shared pure types/utils used by both the UI and the server. Unlike
// `src/server/`, this folder has no `server-only` guard — it's imported
// from client components too, so nothing server-only (secrets, DB, PDGA
// access) belongs here.

/**
 * Pool assignment: Pool B is for players <900 rated at first entry; they
 * earn Pool B points only while <920 (specs/00-Master-Spec.md glossary).
 * Deliberately redeclared here (rather than imported from
 * `src/server/db/schema.ts`) so the pure engine and client UI can share it
 * without depending on server-only code.
 */
export type Pool = "A" | "B";

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
