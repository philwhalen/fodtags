// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.3.
import "server-only";

import { normalizeName } from "@/lib/normalize-name";
import type { NormalizedEntrantResult } from "@server/ingestion/normalize";

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

export interface AutoLink {
  pdgaNumber: number;
  holderId: number;
}

export interface MatchResult {
  matched: MatchedEntrant[];
  unmatched: UnmatchedEntrant[];
  autoLinks: AutoLink[];
}

/** Minimal shape of a tag holder needed for matching. */
export interface MatchableHolder {
  id: number;
  name: string;
  pdgaNumber: number | null;
}

/** Sticky decision from `player_matches` keyed by PDGA number. */
export interface StickyMatch {
  holderId: number | null;
  source: "auto" | "admin";
}

/**
 * Resolve entrants to tag holders (Spec 03 §3.5). Pure given inputs — no DB.
 *
 * 1. Sticky first — linked holder or confirmed non-holder; never re-queue.
 * 2. Exact PDGA# — link even if names differ; emit autoLink.
 * 3. Unique normalized name (no PDGA# hit) — link; emit autoLink.
 * 4. Else — unmatched (zero name matches) or ambiguous (two or more).
 */
export function match(
  entrants: NormalizedEntrantResult[],
  holders: MatchableHolder[],
  stickyMap: Map<number, StickyMatch>,
): MatchResult {
  const matched: MatchedEntrant[] = [];
  const unmatched: UnmatchedEntrant[] = [];
  const autoLinks: AutoLink[] = [];

  for (const entrant of entrants) {
    const sticky = entrant.pdgaNumber !== null ? stickyMap.get(entrant.pdgaNumber) : undefined;

    if (sticky !== undefined) {
      if (sticky.holderId !== null) {
        matched.push({ holderId: sticky.holderId, entrant });
      }
      continue;
    }

    const pdgaHit =
      entrant.pdgaNumber !== null
        ? holders.find((h) => h.pdgaNumber === entrant.pdgaNumber)
        : undefined;

    if (pdgaHit) {
      matched.push({ holderId: pdgaHit.id, entrant });
      if (entrant.pdgaNumber !== null) {
        autoLinks.push({ pdgaNumber: entrant.pdgaNumber, holderId: pdgaHit.id });
      }
      continue;
    }

    const normalizedEntrantName = normalizeName(entrant.displayName);
    const nameHits = holders.filter((h) => normalizeName(h.name) === normalizedEntrantName);

    if (nameHits.length === 1) {
      const holder = nameHits[0]!;
      matched.push({ holderId: holder.id, entrant });
      if (entrant.pdgaNumber !== null) {
        autoLinks.push({ pdgaNumber: entrant.pdgaNumber, holderId: holder.id });
      }
      continue;
    }

    if (nameHits.length >= 2) {
      unmatched.push({ entrant, reason: "ambiguous" });
      continue;
    }

    if (entrant.pdgaNumber !== null) {
      unmatched.push({ entrant, reason: "no-name-match" });
    } else {
      unmatched.push({ entrant, reason: "no-pdga-number-match" });
    }
  }

  return { matched, unmatched, autoLinks };
}
