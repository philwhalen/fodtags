import { isValidSubLeague } from "./public-routes";
import type { SubLeagueSlug } from "./public-routes";
import type { RoundsFilter, RoundTypeCode } from "./rounds-types";

const VALID_TYPE_CODES: RoundTypeCode[] = ["ln", "tournament", "fodopen"];
const TYPE_ORDER: RoundTypeCode[] = ["ln", "tournament", "fodopen"];

function normalizeTypes(codes: RoundTypeCode[]): RoundTypeCode[] {
  const set = new Set(codes);
  set.add("ln");
  return TYPE_ORDER.filter((code) => set.has(code));
}

export function parseRoundsFilter(params: {
  league?: string;
  types?: string;
}): RoundsFilter {
  const league =
    params.league !== undefined && isValidSubLeague(params.league) ? params.league : null;

  let types: RoundTypeCode[] = ["ln"];
  if (params.types !== undefined) {
    const parsed = params.types
      .split(",")
      .map((part) => part.trim())
      .filter((part): part is RoundTypeCode =>
        (VALID_TYPE_CODES as readonly string[]).includes(part),
      );
    types = normalizeTypes(parsed.length > 0 ? parsed : ["ln"]);
  }

  if (league !== null) {
    types = ["ln"];
  }

  return { league, types };
}

export function serializeRoundsFilter(
  filter: RoundsFilter,
): { league?: string; types?: string } {
  const result: { league?: string; types?: string } = {};
  if (filter.league !== null) {
    result.league = filter.league;
  }
  if (!(filter.types.length === 1 && filter.types[0] === "ln")) {
    result.types = filter.types.join(",");
  }
  return result;
}

export interface RoundsLinks {
  subLeagueHref: (slug: SubLeagueSlug | null) => string;
  typeToggleHref: (code: RoundTypeCode) => string;
}

function roundsPath(
  seasonYear: number,
  filter: RoundsFilter,
): string {
  const base = `/${seasonYear}/rounds`;
  const params = serializeRoundsFilter(filter);
  const search = new URLSearchParams();
  if (params.league !== undefined) {
    search.set("league", params.league);
  }
  if (params.types !== undefined) {
    search.set("types", params.types);
  }
  const qs = search.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Pure link builder for the Rounds view controls (Spec 05 §5.4/§5.7).
 * `subLeagueHref` selects All or a sub-league (forcing League Night only);
 * `typeToggleHref` adds/removes tournament/fodopen when no sub-league is set.
 */
export function buildRoundsLinks(seasonYear: number, filter: RoundsFilter): RoundsLinks {
  return {
    subLeagueHref(slug: SubLeagueSlug | null) {
      if (slug === null) {
        return roundsPath(seasonYear, { league: null, types: filter.types });
      }
      return roundsPath(seasonYear, { league: slug, types: ["ln"] });
    },
    typeToggleHref(code: RoundTypeCode) {
      if (code === "ln") {
        return roundsPath(seasonYear, filter);
      }
      const types = new Set(filter.league !== null ? (["ln"] as RoundTypeCode[]) : filter.types);
      if (types.has(code)) {
        types.delete(code);
      } else {
        types.add(code);
      }
      types.add("ln");
      const normalized = TYPE_ORDER.filter((t) => types.has(t));
      return roundsPath(seasonYear, { league: null, types: normalized });
    },
  };
}
