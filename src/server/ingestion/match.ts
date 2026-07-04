// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.3.
import "server-only";

import type { NormalizedEntrantResult, NormalizedEventResult } from "@server/ingestion/normalize";

/** A normalized entrant successfully resolved to a tag holder. */
export interface MatchedEntrant {
  holderId: number;
  entrant: NormalizedEntrantResult;
}

/**
 * A normalized entrant that could not be confidently resolved — lands in
 * the admin review queue (Spec 03 §3.5) rather than being silently guessed
 * or silently dropped.
 */
export interface UnmatchedEntrant {
  entrant: NormalizedEntrantResult;
  reason: "no-pdga-number-match" | "no-name-match" | "ambiguous";
}

export interface MatchResult {
  matched: MatchedEntrant[];
  unmatched: UnmatchedEntrant[];
}

/** Minimal shape of a tag holder needed for matching. */
export interface MatchableHolder {
  id: number;
  name: string;
  pdgaNumber: number | null;
}

/**
 * Resolve a normalized event's entrants to tag holders (Spec 03 §3.5
 * "Admin maps, app assists"):
 *
 * 1. Auto-match by **PDGA number** first, then normalized name.
 * 2. Confident matches apply automatically.
 * 3. Anything ambiguous/unmatched goes to the admin review queue — this
 *    function never silently guesses.
 * 4. Matches should be **sticky** once an admin confirms them (persisted
 *    across refreshes) — that persistence layer doesn't exist yet.
 *
 * TODO (deferred to the matching feature work, Spec 10): this skeleton has
 * no entrants to match (the stub source always returns `[]`), so there is
 * no PDGA#/name matching logic, no confidence scoring, and no persisted
 * review queue yet. When real entrants arrive, implement here:
 *   - exact PDGA# lookup against `tagHolders.pdgaNumber`,
 *   - normalized-name fallback (case/whitespace/punctuation-insensitive),
 *   - ambiguous-match detection (e.g. two holders sharing a normalized name),
 *   - persisting confirmed `PDGA# -> holder` mappings so they're sticky,
 *   - writing unresolved entrants to an admin review queue table.
 */
export function match(normalized: NormalizedEventResult, holders: MatchableHolder[]): MatchResult {
  // `normalized.entrants` is always `[]` while only the stub source exists
  // (see normalize.ts) — nothing to match yet, against any of `holders`.
  // See the TODO above for what belongs here once real entrants arrive.
  void normalized;
  void holders;
  return {
    matched: [],
    unmatched: [],
  };
}
