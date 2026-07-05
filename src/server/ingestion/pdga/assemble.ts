// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.7.
import "server-only";

import type {
  LiveApiEventBody,
  RawEventPayload,
  RawScoreEntry,
} from "@server/ingestion/pdga/source";

export interface RoundInput {
  division: string;
  round: number;
  scores: RawScoreEntry[];
}

/**
 * Build a `RawEventPayload` from parsed live-api event metadata and per-round
 * score arrays — shared by `liveSource`, `fixtureSource`, and the recorder.
 */
export function assembleRawEventPayload(
  pdgaEventId: string,
  eventData: LiveApiEventBody,
  roundInputs: RoundInput[],
): RawEventPayload {
  return {
    pdgaEventId,
    meta: {
      HighestCompletedRound: eventData.HighestCompletedRound,
      FinalRound: eventData.FinalRound,
      EndDate: eventData.EndDate,
      DateRange: eventData.DateRange,
      StartDate: eventData.StartDate,
    },
    divisions: eventData.Divisions.map((d) => ({
      DivisionID: d.DivisionID,
      Division: d.Division,
      LatestRound: d.LatestRound,
    })),
    rounds: roundInputs.map((r) => ({
      Division: r.division,
      Round: r.round,
      scores: r.scores,
    })),
  };
}
