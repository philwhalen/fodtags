// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { computeSeason } from "@server/engine";
import { hasStaleSource } from "@server/db/repositories/eventSources";
import { countPending } from "@server/db/repositories/playerMatches";
import { listHolders } from "@server/db/repositories/tagHolders";
import { loadSeasonSnapshot } from "@server/db/repositories/seasonSnapshot";
import type {
  Pool,
  PublicOlpPayload,
  PublicRoundsPayload,
  SeasonStandingRow,
  SubLeagueType,
  SubLeagueWindow,
} from "@/lib";
import { buildRoundsView } from "@server/readmodel/rounds-build";

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

/**
 * Payload for the `sub-leagues` meta view (Spec 04 §4.3/§4.5 boundary
 * decision): the admin-configured window for each sub-league, so public
 * routes can resolve "current" at request time (`resolveCurrentSubLeague`
 * in `src/lib/current-sub-league.ts`) without ever reading `event_sources`
 * directly.
 */
export interface SubLeagueMetaPayload {
  subLeagues: SubLeagueWindow[];
  updatedAt: string;
}

/** One not-yet-published view row, keyed by the deep-link-aligned `viewKey`. */
export interface ViewRow {
  seasonYear: number;
  /** e.g. `championship/pool-a`, `sub-league/mid/pool-b` (Spec 04 §4.5
   * deep-link naming), or the `sub-leagues` meta view key. */
  viewKey: string;
  payload: StandingsViewPayload | SubLeagueMetaPayload | PublicRoundsPayload | PublicOlpPayload;
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
 * Per-view staleness from `event_sources.stale` (Spec 03 §3.8 / Spec 04
 * §4.4). Championship views reflect any stale source; sub-league views
 * reflect only that sub-league's source.
 */
function isViewStale(seasonYear: number, subLeagueType?: SubLeagueType): boolean {
  if (subLeagueType) {
    return hasStaleSource(seasonYear, [subLeagueType]);
  }
  return hasStaleSource(seasonYear);
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
  const pendingReview = countPending(seasonYear);

  const views: ViewRow[] = [];

  for (const pool of POOLS) {
    views.push({
      seasonYear,
      viewKey: `championship/pool-${pool.toLowerCase()}`,
      payload: {
        rows: toStandingsRows(results.championship[pool], nameById),
        updatedAt,
        stale: isViewStale(seasonYear),
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
          stale: isViewStale(seasonYear, type),
          pendingReview,
          finalized,
        },
      });
    }
  }

  // OLP views (Spec 06 §6.2/§6.4): one `olp/<sub-league>` view per
  // sub-league, projecting `results.olp`/`results.olpPot` (already computed
  // by the pure engine above) + resolved holder names. No new computation
  // happens here — the eligible-only re-rank and not-eligible split are a
  // display-time concern handled by `projectOlp` (src/lib/olp-view.ts).
  for (const type of SUB_LEAGUE_TYPES) {
    const rows = results.olp[type].map((r) => ({
      ...r,
      name: nameById.get(r.holderId) ?? `Holder #${r.holderId}`,
    }));
    views.push({
      seasonYear,
      viewKey: `olp/${type.toLowerCase()}`,
      payload: {
        subLeague: type,
        rows,
        pot: results.olpPot[type],
        // Mirrors the sub-league's `complete` flag, same as `finalized`
        // above — while incomplete, the pot/payouts here are projections.
        projected: !results.podium[type].complete,
        updatedAt,
        stale: isViewStale(seasonYear, type),
        pendingReview,
      },
    });
  }

  // `sub-leagues` meta view (Spec 04 §4.3/§4.5 boundary decision): sourced
  // from the snapshot already loaded above — no separate `event_sources`
  // read here.
  views.push({
    seasonYear,
    viewKey: "sub-leagues",
    payload: {
      subLeagues: snapshot.subLeagues.map((sl) => ({
        type: sl.type,
        startDate: sl.startDate,
        endDate: sl.endDate,
        complete: sl.complete,
      })),
      updatedAt,
    },
  });

  views.push(buildRoundsView(seasonYear));

  return views;
}
