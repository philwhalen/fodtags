// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.3.
import "server-only";

import type { EventSourceCategory } from "@/lib";
import type { RawEventPayload, RawScoreEntry } from "@server/ingestion/pdga/source";

/**
 * Thrown when a round or score row cannot be attributed to a league night
 * within `1..FinalRound` (Spec 03 §3.2 — fail loud in the run log).
 */
export class RoundAttributionError extends Error {
  override name = "RoundAttributionError";

  constructor(message: string) {
    super(message);
  }
}

export interface NormalizedEntrantResult {
  pdgaNumber: number | null;
  displayName: string;
  rawScoreToPar: number;
  roundRating: number | null;
  playerRatingReported: number | null;
  roundFinal: boolean;
  runningPlace: number | null;
  wonPlayoff: boolean;
  profileUrl: string | null;
}

export interface NormalizedRound {
  roundOrdinal: number;
  /** ET calendar date (`YYYY-MM-DD`) for this league night. */
  eventDate: string;
  entrants: NormalizedEntrantResult[];
}

export interface NormalizedEventResult {
  pdgaEventId: string;
  sourceType: EventSourceCategory;
  rounds: NormalizedRound[];
}

/**
 * Derive the ET calendar date for a league night from the event's Thursday
 * cadence. PDGA sub-league events store `StartDate` as round 1's date and
 * advance one week per round (`DateRange` is "Thursdays · …"). Round *n* is
 * `StartDate + (n − 1) × 7` calendar days. Verified against event 104527's
 * `RoundsList` in the recorded fixture (round 7 → 2026-07-02, round 10 →
 * `EndDate` 2026-07-23). Refine in sub-plan 08 if PDGA exposes per-round
 * dates on the round fetch payload.
 */
export function deriveEventDate(startDate: string, roundOrdinal: number): string {
  const parts = startDate.split("-").map(Number);
  const year = parts[0] ?? 0;
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + (roundOrdinal - 1) * 7);
  return date.toISOString().slice(0, 10);
}

function assertRoundInRange(roundOrdinal: number, finalRound: number): void {
  if (roundOrdinal < 1 || roundOrdinal > finalRound) {
    throw new RoundAttributionError(
      `Round ${roundOrdinal} is outside the event's FinalRound (${finalRound})`,
    );
  }
}

function mapEntrant(
  score: RawScoreEntry,
  highestCompletedRound: number,
): NormalizedEntrantResult | null {
  if (score.HasRoundScore !== 1) {
    return null;
  }

  return {
    pdgaNumber: score.HasPDGANum ? score.PDGANum : null,
    displayName: score.Name,
    rawScoreToPar: score.RoundtoPar,
    roundRating: score.RoundRating,
    playerRatingReported: score.Rating,
    roundFinal:
      score.Completed === 1 &&
      score.HasRoundScore === 1 &&
      score.Round <= highestCompletedRound,
    runningPlace: score.RunningPlace,
    wonPlayoff: score.WonPlayoff === "yes",
    profileUrl: score.ProfileURL || null,
  };
}

/**
 * `RawEventPayload` → per-round entrant results (Spec 03 §3.2). One PDGA
 * round becomes one `NormalizedRound` (a future `LeagueNight` row in 05).
 * Pure: no I/O, no DB, no clock — `eventDate` comes only from payload dates.
 */
export function normalize(
  payload: RawEventPayload,
  sourceType: EventSourceCategory,
): NormalizedEventResult {
  const { FinalRound, HighestCompletedRound, StartDate } = payload.meta;
  const rounds: NormalizedRound[] = [];

  for (const rawRound of payload.rounds) {
    assertRoundInRange(rawRound.Round, FinalRound);

    const entrants: NormalizedEntrantResult[] = [];
    for (const score of rawRound.scores) {
      if (score.Round !== rawRound.Round) {
        throw new RoundAttributionError(
          `Score entry Round=${score.Round} does not match round container Round=${rawRound.Round}`,
        );
      }
      assertRoundInRange(score.Round, FinalRound);

      const entrant = mapEntrant(score, HighestCompletedRound);
      if (entrant) {
        entrants.push(entrant);
      }
    }

    rounds.push({
      roundOrdinal: rawRound.Round,
      eventDate: deriveEventDate(StartDate, rawRound.Round),
      entrants,
    });
  }

  return {
    pdgaEventId: payload.pdgaEventId,
    sourceType,
    rounds,
  };
}
