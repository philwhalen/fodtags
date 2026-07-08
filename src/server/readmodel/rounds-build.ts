// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import {
  type PublicRoundsPayload,
  type RoundRow,
  type RoundsHolderEntry,
  type SeasonResults,
  type SubLeagueSlug,
  type SubLeagueType,
  type TagAssignmentRow,
} from "@/lib";
import { listEvents } from "@server/db/repositories/events";
import { listResultsBySeason } from "@server/db/repositories/eventResults";
import { hasStaleSource, listSources } from "@server/db/repositories/eventSources";
import { countPending } from "@server/db/repositories/playerMatches";
import { listRatingsBySeason } from "@server/db/repositories/ratingsHistory";
import { listHolders } from "@server/db/repositories/tagHolders";

import type { ViewRow } from "./build";

const SUB_LEAGUE_SLUGS: SubLeagueSlug[] = ["early", "mid", "late"];

function slugToType(slug: SubLeagueSlug): SubLeagueType {
  return slug.toUpperCase() as SubLeagueType;
}

function resolveSubLeague(sourceType: string, eventType: string): SubLeagueType | null {
  if (
    eventType === "LeagueNight" &&
    (sourceType === "EARLY" || sourceType === "MID" || sourceType === "LATE")
  ) {
    return sourceType;
  }
  return null;
}

/**
 * Rebuilds a per-holder "tag as of date" resolver from the *published*
 * `tagAssignments` (Spec 02 §2.10), mirroring `computeTagTimeline`'s
 * internal `tagAsOf` closure (`src/server/engine/tags.ts`) without
 * depending on it directly — the read model only gets the flattened
 * `tagAssignments` array + `currentTagByHolder` off `SeasonResults`
 * (sub-plan 04), not the engine's private closures. `tagAssignments` is
 * already in season (night) order, since the engine walks nights
 * chronologically and appends as it goes.
 */
function buildTagAsOfResolver(
  tagAssignments: TagAssignmentRow[],
  eventDateById: Map<number, string>,
  initialTagByHolder: Map<number, number | null>,
): (holderId: number, date: string) => number | null {
  const byHolder = new Map<number, { date: string; tagOut: number }[]>();
  for (const assignment of tagAssignments) {
    const eventDate = eventDateById.get(assignment.eventId);
    if (eventDate === undefined) continue;
    const list = byHolder.get(assignment.holderId) ?? [];
    list.push({ date: eventDate.slice(0, 10), tagOut: assignment.tagOut });
    byHolder.set(assignment.holderId, list);
  }

  return (holderId: number, date: string): number | null => {
    const target = date.slice(0, 10);
    let result = initialTagByHolder.get(holderId) ?? null;
    const list = byHolder.get(holderId);
    if (!list) return result;
    for (const entry of list) {
      if (entry.date <= target) result = entry.tagOut;
      else break;
    }
    return result;
  };
}

function latestOfficialRatingByHolder(
  ratings: ReturnType<typeof listRatingsBySeason>,
): Map<number, number> {
  const best = new Map<number, { rating: number; effectiveDate: string }>();
  for (const row of ratings) {
    if (!row.official) {
      continue;
    }
    const prev = best.get(row.holderId);
    if (prev === undefined || row.effectiveDate > prev.effectiveDate) {
      best.set(row.holderId, { rating: row.rating, effectiveDate: row.effectiveDate });
    }
  }
  return new Map([...best.entries()].map(([id, { rating }]) => [id, rating]));
}

export function assembleRoundsPayload(
  seasonYear: number,
  seasonResults: SeasonResults,
  slugById: Map<number, string>,
): PublicRoundsPayload {
  const holders = listHolders(seasonYear).filter((h) => h.active);
  const events = listEvents(seasonYear);
  const sources = listSources(seasonYear);
  const results = listResultsBySeason(seasonYear);
  const ratings = listRatingsBySeason(seasonYear);

  const eventById = new Map(events.map((e) => [e.id, e]));
  const sourceTypeById = new Map(sources.map((s) => [s.id, s.type]));
  const canceledEventIds = new Set(events.filter((e) => e.canceled).map((e) => e.id));
  const presentRatingByHolder = latestOfficialRatingByHolder(ratings);

  // Tag data (Spec 05 §5.3): a League Night round's tag-in/tag-out is
  // looked up directly off the published `tagAssignments` (one row per
  // holder/League-Night the engine's timeline produced); a Tournament/FOD
  // Open round (no reassignment) carries the holder's tag as of that
  // event's date, resolved from the same `tagAssignments`.
  const assignmentByHolderEvent = new Map<string, TagAssignmentRow>();
  for (const assignment of seasonResults.tagAssignments) {
    assignmentByHolderEvent.set(`${assignment.holderId}:${assignment.eventId}`, assignment);
  }
  const initialTagByHolder = new Map(holders.map((h) => [h.id, h.tagNumber]));
  const eventDateById = new Map(events.map((e) => [e.id, e.eventDate]));
  const tagAsOf = buildTagAsOfResolver(
    seasonResults.tagAssignments,
    eventDateById,
    initialTagByHolder,
  );

  const roundsByHolder = new Map<number, RoundRow[]>();
  for (const result of results) {
    if (result.holderId === null) {
      continue;
    }
    const event = eventById.get(result.eventId);
    if (event === undefined || canceledEventIds.has(event.id)) {
      continue;
    }

    const sourceType = sourceTypeById.get(event.eventSourceId);
    const subLeague =
      sourceType !== undefined ? resolveSubLeague(sourceType, event.type) : null;

    let tagIn: number | null;
    let tagOut: number | null;
    if (subLeague !== null) {
      const assignment = assignmentByHolderEvent.get(`${result.holderId}:${event.id}`);
      tagIn = assignment?.tagIn ?? null;
      tagOut = assignment?.tagOut ?? null;
    } else {
      const asOf = tagAsOf(result.holderId, event.eventDate);
      tagIn = asOf;
      tagOut = asOf;
    }

    const round: RoundRow = {
      eventId: event.id,
      date: event.eventDate,
      type: event.type,
      subLeague,
      eventLabel: event.label,
      roundOrdinal: event.roundOrdinal,
      scoreToPar: result.rawScoreToPar,
      roundRating: result.roundRating ?? null,
      tagIn,
      tagOut,
    };

    const bucket = roundsByHolder.get(result.holderId) ?? [];
    bucket.push(round);
    roundsByHolder.set(result.holderId, bucket);
  }

  const holderEntries: RoundsHolderEntry[] = holders.map((h) => ({
    holderId: h.id,
    name: h.name,
    slug: slugById.get(h.id) ?? String(h.id),
    tagNumber: h.tagNumber,
    presentRating: presentRatingByHolder.get(h.id) ?? null,
    rounds: roundsByHolder.get(h.id) ?? [],
  }));

  const staleLeagues = SUB_LEAGUE_SLUGS.filter((slug) =>
    hasStaleSource(seasonYear, [slugToType(slug)]),
  );

  return {
    holders: holderEntries,
    updatedAt: new Date().toISOString(),
    stale: hasStaleSource(seasonYear),
    staleLeagues,
    pendingReview: countPending(seasonYear),
  };
}

/**
 * Build the `rounds` read-model view directly from repositories (Spec 05).
 * Per-round fields are not part of the engine output — see plans chunk 02.
 */
export function buildRoundsView(
  seasonYear: number,
  seasonResults: SeasonResults,
  slugById: Map<number, string>,
): ViewRow {
  return {
    seasonYear,
    viewKey: "rounds",
    payload: assembleRoundsPayload(seasonYear, seasonResults, slugById),
  };
}
