// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { listEvents } from "@server/db/repositories/events";
import { hasStaleSource } from "@server/db/repositories/eventSources";
import {
  slugifyName,
  type Pool,
  type PublicScoreSheetHolder,
  type PublicScoreSheetPayload,
  type ScoreSheetCaps,
  type ScoreSheetEntry,
  type ScoreSheetLineItem,
  type ScoreSheetViewLine,
  type SeasonResults,
  type SubLeagueType,
} from "@/lib";

import type { ViewRow } from "./build";

const POOLS: Pool[] = ["A", "B"];
const SUB_LEAGUE_TYPES: SubLeagueType[] = ["EARLY", "MID", "LATE"];

function emptyScoreSheetEntry(): ScoreSheetEntry {
  return {
    byType: { LeagueNight: 0, Tournament: 0, FODOpen: 0, Podium: 0 },
    countedLineItems: [],
    droppedLineItems: [],
    total: 0,
  };
}

/**
 * Enriches one engine `ScoreSheetLineItem` into a `ScoreSheetViewLine`,
 * attaching the repo-sourced `label`/`roundOrdinal` (Spec 07 §7.2 Decision
 * 2). The synthetic Podium `eventId: -1` never resolves against
 * `eventById` — its display title composes from `subLeague` instead, at
 * the pure-helper layer (`composeTitle` in `src/lib/score-sheet-view.ts`).
 * `droppedReason`, when present, rides straight through.
 */
function enrichLine(
  item: ScoreSheetLineItem,
  eventById: Map<number, { label: string; roundOrdinal: number | null }>,
): ScoreSheetViewLine {
  const event = item.eventId === -1 ? undefined : eventById.get(item.eventId);
  return {
    eventId: item.eventId,
    type: item.type,
    subLeague: item.subLeague,
    date: item.eventDate,
    label: event?.label ?? "",
    roundOrdinal: event?.roundOrdinal ?? null,
    pool: item.pool,
    rank: item.rank,
    points: item.points,
    tieBrokenByTag: item.tieBrokenByTag,
    ...(item.droppedReason ? { droppedReason: item.droppedReason } : {}),
  };
}

/**
 * Not-yet-final Podium lines for every sub-league still incomplete,
 * grouped by holder (Spec 07 §7.2 Decision 1). Once a sub-league is marked
 * `complete` the engine already folds its Podium bonus into
 * `scoreSheet[holderId].countedLineItems` (synthetic `eventId: -1`), so no
 * projected line is emitted for it here — only one of {counted, projected}
 * is ever present for a given holder/sub-league.
 */
function buildProjectedPodiumByHolder(
  results: SeasonResults,
): Map<number, ScoreSheetViewLine[]> {
  const byHolder = new Map<number, ScoreSheetViewLine[]>();
  for (const type of SUB_LEAGUE_TYPES) {
    const standing = results.podium[type];
    if (standing.complete) continue;
    for (const pool of POOLS) {
      for (const row of standing[pool]) {
        const line: ScoreSheetViewLine = {
          eventId: -1,
          type: "Podium",
          subLeague: type,
          // No settled "as of" date exists for a still-projected Podium
          // (the engine only stamps `eventDate` once a sub-league is
          // complete) — the pure helper never reads `date` for a Podium
          // line (sort order there is by sub-league, not date), so "" is
          // a safe placeholder.
          date: "",
          label: "",
          roundOrdinal: null,
          pool,
          rank: row.rank,
          points: row.totalPoints,
          tieBrokenByTag: row.tieBrokenByTag,
        };
        const list = byHolder.get(row.holderId) ?? [];
        list.push(line);
        byHolder.set(row.holderId, list);
      }
    }
  }
  return byHolder;
}

/**
 * Builds the two `score-sheet/pool-*` read-model views from the single
 * engine `results` `buildViews` already computed (Spec 07 §7.2; plans
 * score-sheets/02-readmodel-build.md). A read-only projection — no new
 * computation, mirrors the OLP build (Feature 3). Holder order/rank/tie-
 * break come straight from `results.championship[pool]`; each holder's
 * line items are the engine's own `scoreSheet[holderId]` entries, enriched
 * with `listEvents` labels; the tournament cap (2 vs 3) is derived from
 * `tournamentSourceCount` exactly as the engine derives it internally.
 */
export function buildScoreSheetViews(
  seasonYear: number,
  results: SeasonResults,
  nameById: Map<number, string>,
  tournamentSourceCount: number,
  updatedAt: string,
  pendingReview: number,
): ViewRow[] {
  const eventById = new Map(listEvents(seasonYear).map((e) => [e.id, e]));

  const tournamentCap = tournamentSourceCount <= 3 ? 2 : 3;
  const caps: ScoreSheetCaps = {
    leagueNight: 15,
    tournament: tournamentCap,
    tournamentSourceCount,
    fodOpen: 1,
  };

  const projectedByHolder = buildProjectedPodiumByHolder(results);
  // Whole-season staleness (Spec 04 §4.4 style signal): the sheet spans
  // every event type, so — unlike a sub-league view — there is no single
  // source to narrow to.
  const stale = hasStaleSource(seasonYear);

  return POOLS.map((pool) => {
    const holders: PublicScoreSheetHolder[] = results.championship[pool].map((row) => {
      const name = nameById.get(row.holderId) ?? `Holder #${row.holderId}`;
      const entry = results.scoreSheet[row.holderId] ?? emptyScoreSheetEntry();
      return {
        holderId: row.holderId,
        name,
        slug: slugifyName(name),
        tagNumber: row.tagNumber,
        rank: row.rank,
        tieBrokenByTag: row.tieBrokenByTag,
        byType: entry.byType,
        total: entry.total,
        counted: entry.countedLineItems.map((item) => enrichLine(item, eventById)),
        dropped: entry.droppedLineItems.map((item) => enrichLine(item, eventById)),
        projectedPodium: projectedByHolder.get(row.holderId) ?? [],
      };
    });

    const payload: PublicScoreSheetPayload = {
      pool,
      holders,
      caps,
      updatedAt,
      stale,
      pendingReview,
    };

    return {
      seasonYear,
      viewKey: `score-sheet/pool-${pool.toLowerCase()}`,
      payload,
    };
  });
}
