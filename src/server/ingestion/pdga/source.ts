// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.7.
import "server-only";

/**
 * Ingestion boundary (specs/12-Architecture.md §12.7): defined as an
 * interface so the skeleton ships without the real scraper. The pipeline
 * (`src/server/ingestion/pipeline.ts`) only ever depends on this shape, so
 * swapping the stub for the real fetcher later is a one-line change in
 * `getPdgaSource` below — nothing else in the ingestion/engine/readmodel
 * layers needs to know which implementation is live.
 */

/** Event-level metadata from `live_results_fetch_event` (Spec 03 / master plan). */
export interface RawEventMeta {
  HighestCompletedRound: number;
  FinalRound: number;
  EndDate: string;
  DateRange: string;
  StartDate: string;
}

/** One division row from `data.Divisions[]`. */
export interface RawDivision {
  DivisionID: number;
  Division: string;
  LatestRound: number;
}

/**
 * One entrant row from `data.scores[]` — field names kept verbatim from the
 * live-api so `normalize` (sub-plan 03) owns the mapping to DB columns.
 */
export interface RawScoreEntry {
  PDGANum: number | null;
  HasPDGANum: number;
  Name: string;
  FirstName: string;
  LastName: string;
  RoundtoPar: number;
  ToPar: number;
  RoundRating: number | null;
  Rating: number | null;
  Completed: number;
  HasRoundScore: number;
  Round: number;
  RunningPlace: number | null;
  Tied: boolean;
  WonPlayoff: string;
  ProfileURL: string;
  Rounds: string;
  Division: string;
}

/** Per-round scores for one division. */
export interface RawRound {
  Division: string;
  Round: number;
  scores: RawScoreEntry[];
}

/**
 * Raw, unnormalized payload for a single PDGA event fetch — the shape both
 * `liveSource` and `fixtureSource` assemble from the live-api responses.
 */
export interface RawEventPayload {
  pdgaEventId: string;
  meta: RawEventMeta;
  divisions: RawDivision[];
  rounds: RawRound[];
}

/** Options for a fetch — reserved for divisions/round filters etc. later. */
export type PdgaFetchOptions = unknown;

export interface PdgaSource {
  fetchEvent(eventId: string, opts?: PdgaFetchOptions): Promise<RawEventPayload>;
}

/** Envelope wrapping every live-api JSON response (`{ data, hash }`). */
export interface LiveApiEnvelope<T> {
  data: T;
  hash: string;
}

/** `data` object from `live_results_fetch_event`. */
export interface LiveApiEventBody {
  Divisions: Array<{
    DivisionID: number;
    Division: string;
    LatestRound: number;
  }>;
  HighestCompletedRound: number;
  FinalRound: number;
  EndDate: string;
  DateRange: string;
  StartDate: string;
}

/** `data` object from `live_results_fetch_round`. */
export interface LiveApiRoundBody {
  scores: RawScoreEntry[];
}
