// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.3.
import "server-only";

import type { RawEventPayload } from "@server/ingestion/pdga/source";

/**
 * A single entrant's normalized round result for one event source, ahead of
 * player matching. Shape is a placeholder — the real fields (division,
 * per-round score-to-par/rating, completion status — Spec 03 §3.2) arrive
 * with the real fetcher; the skeleton only needs enough structure to prove
 * the raw → normalized step runs.
 */
export interface NormalizedEntrantResult {
  pdgaNumber: number | null;
  name: string;
}

export interface NormalizedEventResult {
  pdgaEventId: string;
  entrants: NormalizedEntrantResult[];
}

/**
 * `RawEventPayload` → normalized results (specs/12-Architecture.md §12.3
 * "Ingestion ... normalize"). Skeleton: the stub source's payload always has
 * an empty `entrants` array, so this always returns an empty result set —
 * but the pipeline calls through this function so the shape is exercised
 * and the real mapping (once the fetcher lands) has a home.
 */
export function normalize(payload: RawEventPayload): NormalizedEventResult {
  // `payload.entrants` is typed `[]` (always empty) while only the stub
  // source exists — so there is nothing to map yet. The real fetcher lands
  // with a populated `entrants` array; this function is the seam where that
  // raw → normalized mapping (per-round score/rating/status, Spec 03 §3.2)
  // will be written, without the pipeline needing to change.
  return {
    pdgaEventId: payload.pdgaEventId,
    entrants: [],
  };
}
