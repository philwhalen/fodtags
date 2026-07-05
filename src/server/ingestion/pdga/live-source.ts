// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.7.
import "server-only";

import { assembleRawEventPayload } from "@server/ingestion/pdga/assemble";
import { pdgaFetch } from "@server/ingestion/pdga/http";
import { parseEvent, parseRound } from "@server/ingestion/pdga/schema";
import type {
  LiveApiEventBody,
  LiveApiRoundBody,
  PdgaSource,
  RawEventPayload,
} from "@server/ingestion/pdga/source";

const LIVE_API_BASE = "https://www.pdga.com/apps/tournament/live-api";

export function eventUrl(eventId: string): string {
  return `${LIVE_API_BASE}/live_results_fetch_event?TournID=${encodeURIComponent(eventId)}`;
}

export function roundUrl(eventId: string, division: string, round: number): string {
  const params = new URLSearchParams({
    TournID: eventId,
    Division: division,
    Round: String(round),
  });
  return `${LIVE_API_BASE}/live_results_fetch_round?${params.toString()}`;
}

export function refererForEvent(eventId: string): string {
  return `https://www.pdga.com/live/event/${eventId}/leaders`;
}

async function fetchEventBody(eventId: string): Promise<LiveApiEventBody> {
  const response = await pdgaFetch(eventUrl(eventId), { referer: refererForEvent(eventId) });
  if (!response.ok) {
    throw new Error(`live_results_fetch_event failed: HTTP ${response.status} for event ${eventId}`);
  }
  const raw: unknown = await response.json();
  return parseEvent(raw, { eventId });
}

async function fetchRoundBody(
  eventId: string,
  division: string,
  round: number,
): Promise<LiveApiRoundBody> {
  const response = await pdgaFetch(roundUrl(eventId, division, round), {
    referer: refererForEvent(eventId),
  });
  if (!response.ok) {
    throw new Error(
      `live_results_fetch_round failed: HTTP ${response.status} for event ${eventId} ${division} R${round}`,
    );
  }
  const raw: unknown = await response.json();
  return parseRound(raw, { eventId, division, round });
}

/**
 * Real `PdgaSource`: header-fetch against the PDGA live-api. Opt in via
 * `PDGA_SOURCE=live` — never used in CI (fixture source drives tests).
 */
export const liveSource: PdgaSource = {
  async fetchEvent(eventId: string): Promise<RawEventPayload> {
    const eventData = await fetchEventBody(eventId);
    const roundInputs = [];

    for (const division of eventData.Divisions) {
      for (let round = 1; round <= eventData.HighestCompletedRound; round++) {
        const roundData = await fetchRoundBody(eventId, division.Division, round);
        roundInputs.push({
          division: division.Division,
          round,
          scores: roundData.scores,
        });
      }
    }

    return assembleRawEventPayload(eventId, eventData, roundInputs);
  },
};
