// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.3.
import "server-only";

import { sqlite } from "@server/db/client";
import { upsertLeagueNight } from "@server/db/repositories/events";
import { upsertResult } from "@server/db/repositories/eventResults";
import type { MatchResult } from "@server/ingestion/match";
import type { NormalizedEntrantResult, NormalizedEventResult } from "@server/ingestion/normalize";

export interface PersistSource {
  id: number;
  type: string;
}

/**
 * Correlate each matched entrant back to its holder by ENTRANT OBJECT
 * IDENTITY, not by PDGA number. `match()` runs over the same entrant object
 * references the persist loop iterates (pipeline flatMaps
 * `normalized.rounds[].entrants` straight into `match`), so identity is a
 * stable key — and, unlike PDGA number, it also carries the holderId for a
 * tag holder who played as a guest with no PDGA number on file
 * (name-matched but null `pdgaNumber`). Keying by PDGA number silently
 * dropped those matches.
 */
function holderIdByEntrant(matchResult: MatchResult): Map<NormalizedEntrantResult, number> {
  const map = new Map<NormalizedEntrantResult, number>();
  for (const { holderId, entrant } of matchResult.matched) {
    map.set(entrant, holderId);
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
  const holderByEntrant = holderIdByEntrant(matchResult);
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
        const holderId = holderByEntrant.get(entrant) ?? null;

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
