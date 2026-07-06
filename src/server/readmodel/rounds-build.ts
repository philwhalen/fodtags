// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import {
  type PublicRoundsPayload,
  type RoundRow,
  type RoundsHolderEntry,
  type SubLeagueSlug,
  type SubLeagueType,
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
    const round: RoundRow = {
      eventId: event.id,
      date: event.eventDate,
      type: event.type,
      subLeague:
        sourceType !== undefined ? resolveSubLeague(sourceType, event.type) : null,
      eventLabel: event.label,
      roundOrdinal: event.roundOrdinal,
      scoreToPar: result.rawScoreToPar,
      roundRating: result.roundRating ?? null,
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
  slugById: Map<number, string>,
): ViewRow {
  return {
    seasonYear,
    viewKey: "rounds",
    payload: assembleRoundsPayload(seasonYear, slugById),
  };
}
