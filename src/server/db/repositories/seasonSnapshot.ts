// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { listEntryCounts } from "@server/db/repositories/entryCounts";
import { listEvents } from "@server/db/repositories/events";
import { listResultsBySeason } from "@server/db/repositories/eventResults";
import { listSources } from "@server/db/repositories/eventSources";
import { listSwitchesBySeason } from "@server/db/repositories/poolSwitches";
import { listRatingsBySeason } from "@server/db/repositories/ratingsHistory";
import { listHolders } from "@server/db/repositories/tagHolders";
import type { EventSourceCategory, SeasonSnapshot, SubLeagueType } from "@/lib";

const SUB_LEAGUE_TYPES: SubLeagueType[] = ["EARLY", "MID", "LATE"];

function isSubLeagueType(x: string): x is SubLeagueType {
  return x === "EARLY" || x === "MID" || x === "LATE";
}

/**
 * Assembles the pure engine's AUTHORITATIVE input contract —
 * `SeasonSnapshot` from `src/lib/season-snapshot.ts` — from the normalized
 * store. This is the only I/O in the recompute pipeline (sub-plan 04,
 * `src/server/readmodel/index.ts`'s `recompute`); `computeSeason` itself
 * stays plain-in/plain-out.
 *
 * This repo previously returned its own DB-row-shaped first-cut type
 * (sub-plan 01); sub-plan 04 reshapes it to return `@/lib`'s type
 * directly, so `computeSeason` can consume it with no adapter at the call
 * site. Notable reshaping decisions:
 *   - `tagHolders` -> `holders`: `pool` -> `basePool` (pool switches move a
 *     holder away from this over the season); `name`/display fields are
 *     display-only and are NOT part of the engine's input (the read-model
 *     builder looks holder names up separately — see
 *     `src/server/readmodel/build.ts`).
 *   - `eventSources` (a flat list, Early/Mid/Late/Tournament/FodOpen mixed
 *     together) -> `subLeagues` (always exactly 3 rows, Early/Mid/Late,
 *     with null dates/`complete: false` if that sub-league has no source
 *     configured yet) + `tournamentSourceCount` (a derived count, not a
 *     list — the engine only needs the count for the best-2-vs-3 cap).
 *   - `events[].eventSourceId` (a foreign key) -> `events[].sourceType` (the
 *     resolved category), and each event's `eventResults` are nested
 *     directly under it as `events[].results`, matching how `computeSeason`
 *     walks the snapshot event-by-event.
 *   - `playerMatches` is dropped entirely — `eventResults.holderId` is
 *     already resolved by matching before this snapshot is assembled, so
 *     the engine (which only ever reads `holderId`) has no use for the
 *     sticky pdgaNumber<->holder table itself.
 *   - `entryCounts` (one row per event) -> one row per event, tagged with
 *     its event's sub-league type (Tournament/FOD Open entry counts, if
 *     any, are dropped — Spec 09's `$1 x paidEntries` OLP pot is a
 *     sub-league-only concept); `computeSeason` sums them per sub-league
 *     itself, so no aggregation happens here.
 */
export function loadSeasonSnapshot(seasonYear: number): SeasonSnapshot {
  const holders = listHolders(seasonYear);
  const sources = listSources(seasonYear);
  const events = listEvents(seasonYear);
  const results = listResultsBySeason(seasonYear);
  const ratings = listRatingsBySeason(seasonYear);
  const switches = listSwitchesBySeason(seasonYear);
  const entryCounts = listEntryCounts(seasonYear);

  const sourceById = new Map(sources.map((s) => [s.id, s]));
  const eventById = new Map(events.map((e) => [e.id, e]));

  const resultsByEvent = new Map<number, typeof results>();
  for (const r of results) {
    const list = resultsByEvent.get(r.eventId) ?? [];
    list.push(r);
    resultsByEvent.set(r.eventId, list);
  }

  const tournamentSourceCount = sources.filter((s) => s.type === "TOURNAMENT").length;

  return {
    seasonYear,
    holders: holders.map((h) => ({
      id: h.id,
      tagNumber: h.tagNumber,
      basePool: h.pool,
      entryDate: h.entryDate,
      pdgaNumber: h.pdgaNumber,
      pdgaMembership: h.pdgaMembership,
      ratingAtEntry: h.ratingAtEntry,
      active: h.active,
    })),
    poolSwitches: switches.map((s) => ({
      holderId: s.holderId,
      effectiveDate: s.effectiveDate,
      toPool: s.toPool,
    })),
    ratings: ratings.map((r) => ({
      holderId: r.holderId,
      effectiveDate: r.effectiveDate,
      rating: r.rating,
      official: r.official,
    })),
    subLeagues: SUB_LEAGUE_TYPES.map((type) => {
      const source = sources.find((s) => s.type === type);
      return {
        type,
        startDate: source?.startDate ?? null,
        endDate: source?.endDate ?? null,
        complete: source?.complete ?? false,
      };
    }),
    tournamentSourceCount,
    events: events.map((e) => {
      const source = sourceById.get(e.eventSourceId);
      if (!source) {
        throw new Error(
          `loadSeasonSnapshot: event ${e.id} references missing event_source ${e.eventSourceId}`,
        );
      }
      return {
        id: e.id,
        sourceType: source.type as EventSourceCategory,
        type: e.type,
        eventDate: e.eventDate,
        roundOrdinal: e.roundOrdinal,
        canceled: e.canceled,
        results: (resultsByEvent.get(e.id) ?? []).map((r) => ({
          holderId: r.holderId,
          rawScoreToPar: r.rawScoreToPar,
          roundRating: r.roundRating,
          tagPresent: r.tagPresent,
        })),
      };
    }),
    entryCounts: entryCounts.flatMap((ec) => {
      const event = eventById.get(ec.eventId);
      if (!event) {
        throw new Error(`loadSeasonSnapshot: entry count ${ec.id} references missing event ${ec.eventId}`);
      }
      const source = sourceById.get(event.eventSourceId);
      if (!source || !isSubLeagueType(source.type)) {
        // Tournament/FOD Open entry counts (if ever recorded) aren't part
        // of the sub-league OLP pot (Spec 09 §9.1) — skip rather than
        // misattribute them to a sub-league.
        return [];
      }
      return [{ subLeagueType: source.type, paidEntries: ec.paidEntries }];
    }),
  };
}
