// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.3.
import "server-only";

import { sqlite } from "@server/db/client";
import { upsertLeagueNight } from "@server/db/repositories/events";
import { upsertResult } from "@server/db/repositories/eventResults";
import type { MatchResult } from "@server/ingestion/match";
import type { NormalizedEventResult } from "@server/ingestion/normalize";

export interface PersistSource {
  id: number;
  type: string;
}

function holderIdByPdgaNumber(matchResult: MatchResult): Map<number, number> {
  const map = new Map<number, number>();
  for (const { holderId, entrant } of matchResult.matched) {
    if (entrant.pdgaNumber !== null) {
      map.set(entrant.pdgaNumber, holderId);
    }
  }
  return map;
}

/**
 * Write normalized rounds + match results to `events`/`event_results`
 * (Spec 03 §3.7). One SQLite transaction per source so a partial write
 * never leaves half a sub-league ingested.
 */
export function persistEvent(
  seasonYear: number,
  source: PersistSource,
  normalized: NormalizedEventResult,
  matchResult: MatchResult,
): number {
  const holderByPdga = holderIdByPdgaNumber(matchResult);
  let roundsPersisted = 0;

  const runPersist = sqlite.transaction(() => {
    for (const round of normalized.rounds) {
      const eventId = upsertLeagueNight({
        seasonYear,
        eventSourceId: source.id,
        roundOrdinal: round.roundOrdinal,
        label: `${source.type} League Night ${round.roundOrdinal}`,
        eventDate: round.eventDate,
      });

      for (const entrant of round.entrants) {
        const holderId =
          entrant.pdgaNumber !== null ? (holderByPdga.get(entrant.pdgaNumber) ?? null) : null;

        upsertResult({
          seasonYear,
          eventId,
          pdgaNumber: entrant.pdgaNumber,
          displayName: entrant.displayName,
          holderId,
          rawScoreToPar: entrant.rawScoreToPar,
          roundRating: entrant.roundRating,
          playerRatingReported: entrant.playerRatingReported,
          roundFinal: entrant.roundFinal,
        });
      }

      roundsPersisted++;
    }
  });

  runPersist();
  return roundsPersisted;
}
