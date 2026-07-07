import { filterRowsByName } from "./filter-rows";
import { tagSortKey } from "./tag-number";
import type { SubLeagueSlug } from "./public-routes";
import type { EventType, SubLeagueType } from "./season-snapshot";
import type {
  RosterRow,
  RoundRow,
  RoundsFilter,
  RoundsHolderEntry,
  RoundTypeCode,
} from "./rounds-types";

function subLeagueSlugToType(slug: SubLeagueSlug): SubLeagueType {
  switch (slug) {
    case "early":
      return "EARLY";
    case "mid":
      return "MID";
    case "late":
      return "LATE";
  }
}

function typeCodeToEventType(code: RoundTypeCode): EventType {
  switch (code) {
    case "ln":
      return "LeagueNight";
    case "tournament":
      return "Tournament";
    case "fodopen":
      return "FODOpen";
  }
}

function compareDateDesc(a: string, b: string): number {
  return b.localeCompare(a);
}

function compareRoundOrdinalDesc(a: number | null, b: number | null): number {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return b - a;
}

function compareRoundOrdinalAsc(a: number | null, b: number | null): number {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return a - b;
}

export function filterHolderRounds(rounds: RoundRow[], filter: RoundsFilter): RoundRow[] {
  let filtered: RoundRow[];
  if (filter.league !== null) {
    const leagueType = subLeagueSlugToType(filter.league);
    filtered = rounds.filter(
      (round) => round.type === "LeagueNight" && round.subLeague === leagueType,
    );
  } else {
    const allowedTypes = new Set(filter.types.map(typeCodeToEventType));
    filtered = rounds.filter((round) => allowedTypes.has(round.type));
  }

  return filtered
    .map((round, index) => ({ round, index }))
    .sort((a, b) => {
      const byDate = compareDateDesc(a.round.date, b.round.date);
      if (byDate !== 0) {
        return byDate;
      }
      const byOrdinal = compareRoundOrdinalDesc(a.round.roundOrdinal, b.round.roundOrdinal);
      if (byOrdinal !== 0) {
        return byOrdinal;
      }
      return a.index - b.index;
    })
    .map(({ round }) => round);
}

export function roundTrendSeries(filteredRounds: RoundRow[]): number[] {
  const rated = filteredRounds
    .filter((round) => round.roundRating !== null)
    .map((round, index) => ({ round, index }))
    .sort((a, b) => {
      const byDate = a.round.date.localeCompare(b.round.date);
      if (byDate !== 0) {
        return byDate;
      }
      const byOrdinal = compareRoundOrdinalAsc(a.round.roundOrdinal, b.round.roundOrdinal);
      if (byOrdinal !== 0) {
        return byOrdinal;
      }
      return a.index - b.index;
    })
    .map(({ round }) => round.roundRating as number);

  if (rated.length < 2) {
    return [];
  }
  return rated;
}

function comparePresentRatingDescNullLast(a: number | null, b: number | null): number {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }
  return b - a;
}

export function summarizeRoster(
  holders: RoundsHolderEntry[],
  filter: RoundsFilter,
): RosterRow[] {
  return holders
    .map((holder) => {
      const filtered = filterHolderRounds(holder.rounds, filter);
      return {
        holderId: holder.holderId,
        name: holder.name,
        slug: holder.slug,
        tagNumber: holder.tagNumber,
        presentRating: holder.presentRating,
        roundCount: filtered.length,
        trend: roundTrendSeries(filtered),
      };
    })
    .sort((a, b) => {
      const byRating = comparePresentRatingDescNullLast(a.presentRating, b.presentRating);
      if (byRating !== 0) {
        return byRating;
      }
      return tagSortKey(a.tagNumber) - tagSortKey(b.tagNumber) || a.holderId - b.holderId;
    });
}

export function filterRosterByName(rows: RosterRow[], query: string): RosterRow[] {
  return filterRowsByName(rows, query);
}
