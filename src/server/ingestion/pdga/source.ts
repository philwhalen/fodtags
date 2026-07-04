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

/**
 * Raw, unnormalized payload for a single PDGA event fetch. `entrants` is
 * intentionally untyped beyond "empty" in the skeleton — the real shape
 * (player name, PDGA#, per-round score/rating, round status — Spec 03 §3.2)
 * arrives with the real fetcher (deferred, §12.14).
 */
export interface RawEventPayload {
  pdgaEventId: string;
  /** Stub: always empty. Real payloads will carry per-round entrant data. */
  entrants: [];
}

/** Options for a fetch — reserved for divisions/round filters etc. later. */
export type PdgaFetchOptions = unknown;

export interface PdgaSource {
  fetchEvent(eventId: string, opts?: PdgaFetchOptions): Promise<RawEventPayload>;
}
