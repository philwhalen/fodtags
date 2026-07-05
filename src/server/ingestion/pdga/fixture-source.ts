// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.7.
import "server-only";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assembleRawEventPayload } from "@server/ingestion/pdga/assemble";
import type {
  LiveApiEnvelope,
  LiveApiEventBody,
  LiveApiRoundBody,
  PdgaSource,
  RawEventPayload,
} from "@server/ingestion/pdga/source";

const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function readFixture<T>(eventId: string, filename: string): LiveApiEnvelope<T> {
  const filePath = path.join(FIXTURES_DIR, eventId, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing fixture: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as LiveApiEnvelope<T>;
}

/**
 * Deterministic `PdgaSource` that replays committed live-api fixtures — the
 * default for unit tests (`PDGA_SOURCE=fixture`) and CI.
 */
export const fixtureSource: PdgaSource = {
  async fetchEvent(eventId: string): Promise<RawEventPayload> {
    const eventEnvelope = readFixture<LiveApiEventBody>(eventId, "event.json");
    const eventData = eventEnvelope.data;
    const roundInputs = [];

    for (const division of eventData.Divisions) {
      for (let round = 1; round <= eventData.HighestCompletedRound; round++) {
        const roundEnvelope = readFixture<LiveApiRoundBody>(eventId, `round-${round}.json`);
        roundInputs.push({
          division: division.Division,
          round,
          scores: roundEnvelope.data.scores,
        });
      }
    }

    return assembleRawEventPayload(eventId, eventData, roundInputs);
  },
};
