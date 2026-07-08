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
  /** The tag the holder held going into this round (Spec 02 §2.10; Spec 05
   * §5.3 Tag column). For a League Night, the night's tag-in from the
   * engine's tag timeline; for Tournament/FOD Open (no reassignment),
   * equals `tagOut` — the holder's tag as of that event's date. `null`
   * when the holder held no tag yet. */
  tagIn: number | null;
  /** The tag the holder held after this round (equal to `tagIn` for a
   * League Night where the reassignment left the holder unchanged, and
   * always equal to `tagIn` for Tournament/FOD Open). `null` when the
   * holder held no tag yet. */
  tagOut: number | null;
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
