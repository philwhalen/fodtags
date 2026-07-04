// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { computeSeason } from "@server/engine";
import { listHolders } from "@server/db/repositories/tagHolders";
import { listRuns } from "@server/db/repositories/refreshRuns";
import { loadSeasonSnapshot } from "@server/db/repositories/seasonSnapshot";
import type { Pool, SeasonStandingRow, SubLeagueType } from "@/lib";

const POOLS: Pool[] = ["A", "B"];
const SUB_LEAGUE_TYPES: SubLeagueType[] = ["EARLY", "MID", "LATE"];

/** One ranked row in a published standing (Spec 04 §4.2 columns + the
 * §2.6 tie-break flag). Field names (`playerId`/`points`, not
 * `holderId`/`totalPoints`) intentionally match the pre-existing public
 * championship page's `StandingRow` shape (`src/lib/index.ts`) so that
 * page keeps working unmodified against this generalized payload. */
export interface StandingsRow {
  rank: number;
  playerId: number;
  name: string;
  tagNumber: number;
  points: number;
  pool: Pool;
  tieBrokenByTag: boolean;
}

/**
 * View-shaped payload for a `read_model` row. `updatedAt`/`stale` are
 * generated HERE (at the build/readmodel edge), not inside the pure engine
 * — the engine stays clock-free (see src/server/engine/index.ts's purity
 * contract).
 */
export interface StandingsViewPayload {
  rows: StandingsRow[];
  updatedAt: string;
  /** Per-source staleness signal (Spec 03 §3.8 / Spec 04 §4.4), derived
   * from the most recently COMPLETED `refresh_runs` row. Always `false`
   * pre-Common-B, since the stub PDGA source never fails a source. */
  stale: boolean;
  /** Count of PDGA results still awaiting director match confirmation
   * (Spec 04 §4.4 "N results pending review"). Always `0` until Common B's
   * match-review queue exists. */
  pendingReview: number;
  /** Sub-league views only (Spec 04 §4.3): mirrors that sub-league's admin
   * `complete` flag — whether the computed Podium bonus shown here has
   * been folded in (`true`) or is still a projection (`false`). Absent on
   * Championship views, which have no such notion. */
  finalized?: boolean;
}

/** One not-yet-published view row, keyed by the deep-link-aligned `viewKey`. */
export interface ViewRow {
  seasonYear: number;
  /** e.g. `championship/pool-a`, `sub-league/mid/pool-b` (Spec 04 §4.5
   * deep-link naming). */
  viewKey: string;
  payload: StandingsViewPayload;
}

function toStandingsRows(
  standing: SeasonStandingRow[],
  nameById: Map<number, string>,
): StandingsRow[] {
  return standing.map((row) => ({
    rank: row.rank,
    playerId: row.holderId,
    name: nameById.get(row.holderId) ?? `Holder #${row.holderId}`,
    tagNumber: row.tagNumber,
    points: row.totalPoints,
    pool: row.pool,
    tieBrokenByTag: row.tieBrokenByTag,
  }));
}

/**
 * Whether the season's most recently COMPLETED refresh reported any failed
 * source (Spec 03 §3.8 "mark that source stale, show a per-view freshness
 * indicator"). This is the only staleness signal available before Common B
 * builds the real PDGA scraper — the stub source used today always
 * succeeds, so this evaluates to `false` in practice until then, but the
 * plumbing is real: a genuinely failed run will flip it.
 */
function isStale(seasonYear: number): boolean {
  const [latest] = listRuns(seasonYear, 1);
  if (!latest || latest.status === "running") return false;
  if (latest.status === "failed") return true;
  const counts = latest.counts as { failedCount?: number } | null;
  return (counts?.failedCount ?? 0) > 0;
}

/**
 * Load inputs (repositories only — no PDGA, no direct DB writes here), run
 * the PURE `computeSeason` engine, and shape the result into view rows
 * keyed by `viewKey`: Championship (both pools) and each sub-league (both
 * pools) — standings only (Spec 04 §4.1/§4.3/§4.5). Rounds, OLP, and
 * score-sheet view shapes are intentionally NOT built here; they arrive
 * with their own features on top of the `olp`/`skins`/`scoreSheet` fields
 * `computeSeason` already produces.
 */
export function buildViews(seasonYear: number): ViewRow[] {
  const snapshot = loadSeasonSnapshot(seasonYear);
  const results = computeSeason(snapshot);

  // Display-only holder names: deliberately NOT part of the engine's
  // `SeasonSnapshot`/`SeasonResults` contract (see seasonSnapshot.ts), so
  // resolved here at the read-model edge instead.
  const nameById = new Map(listHolders(seasonYear).map((h) => [h.id, h.name]));

  const updatedAt = new Date().toISOString();
  const stale = isStale(seasonYear);
  const pendingReview = 0;

  const views: ViewRow[] = [];

  for (const pool of POOLS) {
    views.push({
      seasonYear,
      viewKey: `championship/pool-${pool.toLowerCase()}`,
      payload: {
        rows: toStandingsRows(results.championship[pool], nameById),
        updatedAt,
        stale,
        pendingReview,
      },
    });
  }

  for (const type of SUB_LEAGUE_TYPES) {
    const finalized = results.podium[type].complete;
    for (const pool of POOLS) {
      views.push({
        seasonYear,
        viewKey: `sub-league/${type.toLowerCase()}/pool-${pool.toLowerCase()}`,
        payload: {
          rows: toStandingsRows(results.subLeagues[type][pool], nameById),
          updatedAt,
          stale,
          pendingReview,
          finalized,
        },
      });
    }
  }

  return views;
}
