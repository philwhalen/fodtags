import type { SubLeagueSlug } from "./public-routes";
import type { EventType, SubLeagueType } from "./season-snapshot";

export type RoundTypeCode = "ln" | "tournament" | "fodopen";

/** One league round in the published payload. */
export interface RoundRow {
  eventId: number;
  date: string;
  type: EventType;
  subLeague: SubLeagueType | null;
  eventLabel: string;
  roundOrdinal: number | null;
  scoreToPar: number;
  roundRating: number | null;
}

export interface RoundsHolderEntry {
  holderId: number;
  name: string;
  slug: string;
  tagNumber: number | null;
  presentRating: number | null;
  rounds: RoundRow[];
}

export interface PublicRoundsPayload {
  holders: RoundsHolderEntry[];
  updatedAt: string;
  stale: boolean;
  staleLeagues: SubLeagueSlug[];
  pendingReview: number;
}

/** Normalized, validated filter (from query params). */
export interface RoundsFilter {
  league: SubLeagueSlug | null;
  types: RoundTypeCode[];
}

/** A roster row after applying a filter (what the roster table renders). */
export interface RosterRow {
  holderId: number;
  name: string;
  slug: string;
  tagNumber: number | null;
  presentRating: number | null;
  roundCount: number;
  trend: number[];
}
