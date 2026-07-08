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
  PublicFinancialsPayload,
  PublicOlpPayload,
  PublicPlayersIndexPayload,
  PublicProfilePayload,
  PublicRoundsPayload,
  PublicScoreSheetPayload,
  PublicSkinsPayload,
  SeasonStandingRow,
  SubLeagueType,
  SubLeagueWindow,
} from "@/lib";
import { buildFinancialsView } from "@server/readmodel/financials-build";
import { buildPlayersViews } from "@server/readmodel/players-build";
import { assembleRoundsPayload, buildRoundsView } from "@server/readmodel/rounds-build";
import { buildScoreSheetViews } from "@server/readmodel/score-sheet-build";
import { buildSkinsViews } from "@server/readmodel/skins-build";
import { buildCanonicalSlugs } from "@/lib";

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
  slug: string;
  tagNumber: number | null;
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
  /** Count of provisional (auto-added) holders awaiting confirmation plus
   * entrants still needing a link decision (Spec 04 §4.4 "N players
   * pending review"; Spec 03 §3.5/§3.6). */
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
  payload:
    | StandingsViewPayload
    | SubLeagueMetaPayload
    | PublicRoundsPayload
    | PublicOlpPayload
    | PublicScoreSheetPayload
    | PublicFinancialsPayload
    | PublicSkinsPayload
    | PublicPlayersIndexPayload
    | PublicProfilePayload;
}

function toStandingsRows(
  standing: SeasonStandingRow[],
  nameById: Map<number, string>,
  slugById: Map<number, string>,
): StandingsRow[] {
  return standing.map((row) => ({
    rank: row.rank,
    playerId: row.holderId,
    name: nameById.get(row.holderId) ?? `Holder #${row.holderId}`,
    slug: slugById.get(row.holderId) ?? String(row.holderId),
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
 * `buildViews`' return shape (tag-reassignment sub-plan 04): the not-yet-
 * published view rows, plus the engine's final per-holder current tag
 * (Spec 02 §2.10) so `publish` can write it back to
 * `tag_holders.currentTagNumber` atomically with the pointer flip.
 */
export interface BuildViewsResult {
  views: ViewRow[];
  currentTags: Record<number, number | null>;
}

/**
 * Load inputs (repositories only — no PDGA, no direct DB writes here), run
 * the PURE `computeSeason` engine once, and shape the result into view
 * rows keyed by `viewKey`: Championship + sub-league standings (Spec 04
 * §4.1/§4.3/§4.5), OLP (Spec 06), rounds (Spec 05), score-sheet (Spec 07),
 * and financials (Spec 09) views. Skins views (Spec 08 §8.4) publish the
 * engine's existing `skins` qualification output for profile money sections.
 */
export function buildViews(seasonYear: number): BuildViewsResult {
  const snapshot = loadSeasonSnapshot(seasonYear);
  const results = computeSeason(snapshot);

  const activeHolders = listHolders(seasonYear).filter((h) => h.active);
  const nameById = new Map(activeHolders.map((h) => [h.id, h.name]));
  const slugById = buildCanonicalSlugs(activeHolders);

  const updatedAt = new Date().toISOString();
  const pendingReview = countPending(seasonYear);

  const views: ViewRow[] = [];

  for (const pool of POOLS) {
    views.push({
      seasonYear,
      viewKey: `championship/pool-${pool.toLowerCase()}`,
      payload: {
        rows: toStandingsRows(results.championship[pool], nameById, slugById),
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
          rows: toStandingsRows(results.subLeagues[type][pool], nameById, slugById),
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
      slug: slugById.get(r.holderId) ?? String(r.holderId),
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

  // Score-sheet views (Spec 07 §7.2): one `score-sheet/pool-*` view per
  // pool, projecting `results.scoreSheet`/`championship`/`podium` (already
  // computed by the pure engine above) enriched with `listEvents` labels
  // and the tournament cap. Reuses the same `updatedAt`/`pendingReview`
  // stamped once above — no second clock read, no extra engine run.
  views.push(
    ...buildScoreSheetViews(
      seasonYear,
      results,
      nameById,
      slugById,
      snapshot.tournamentSourceCount,
      updatedAt,
      pendingReview,
    ),
  );

  // Financials view (Spec 09 §9.3; plans financials/02-readmodel-build.md):
  // a read-only projection of `results.financials` (already computed by the
  // pure engine above), wrapped with the same shared `updatedAt`/
  // `pendingReview` and a season-wide staleness signal — financials spans
  // every source, like Championship, so it isn't narrowed to one sub-league.
  views.push(buildFinancialsView(seasonYear, results, updatedAt, isViewStale(seasonYear), pendingReview));

  views.push(
    ...buildSkinsViews(
      seasonYear,
      results,
      nameById,
      slugById,
      updatedAt,
      isViewStale(seasonYear),
      pendingReview,
    ),
  );

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

  views.push(buildRoundsView(seasonYear, results, slugById));

  const roundsPayload = assembleRoundsPayload(seasonYear, results, slugById);
  views.push(
    ...buildPlayersViews(
      seasonYear,
      results,
      snapshot,
      activeHolders,
      roundsPayload,
      slugById,
      updatedAt,
      isViewStale(seasonYear),
      pendingReview,
    ),
  );

  return { views, currentTags: results.currentTagByHolder };
}
