import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  PdgaShapeError,
  fetchEventSchema,
  fetchRoundSchema,
  parseEvent,
  parseRound,
} from "@server/ingestion/pdga/schema";

const FIXTURES_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "__fixtures__",
  "104527",
);

function readFixture(filename: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, filename), "utf8"));
}

describe("PDGA live-api schemas (104527 fixtures)", () => {
  it("parses the recorded event envelope", () => {
    const raw = readFixture("event.json");
    const parsed = fetchEventSchema.parse(raw);
    expect(parsed.data.Divisions[0]?.Division).toBe("MA1");
    expect(parsed.data.HighestCompletedRound).toBe(7);
  });

  it("parses every recorded round envelope", () => {
    for (let round = 1; round <= 7; round++) {
      const raw = readFixture(`round-${round}.json`);
      const parsed = fetchRoundSchema.parse(raw);
      expect(parsed.data.scores.length).toBeGreaterThan(0);
    }
  });

  it("parseEvent returns validated event body", () => {
    const body = parseEvent(readFixture("event.json"), { eventId: "104527" });
    expect(body.StartDate).toBe("2026-05-21");
    expect(body.FinalRound).toBe(10);
  });

  it("parseRound returns validated round body with expected leader fields", () => {
    const body = parseRound(readFixture("round-7.json"), {
      eventId: "104527",
      division: "MA1",
      round: 7,
    });
    const leader = body.scores.find((s) => s.RunningPlace === 1);
    expect(leader).toMatchObject({
      PDGANum: 211843,
      RoundtoPar: -8,
      RoundRating: 989,
      Rating: 952,
    });
  });

  it("throws PdgaShapeError when RoundtoPar is removed from a score entry", () => {
    const raw = structuredClone(readFixture("round-7.json")) as {
      data: { scores: Array<Record<string, unknown>> };
    };
    delete raw.data.scores[0]!.RoundtoPar;

    expect(() =>
      parseRound(raw, { eventId: "104527", division: "MA1", round: 7 }),
    ).toThrow(PdgaShapeError);

    try {
      parseRound(raw, { eventId: "104527", division: "MA1", round: 7 });
    } catch (err) {
      expect(err).toBeInstanceOf(PdgaShapeError);
      const shapeErr = err as PdgaShapeError;
      expect(shapeErr.eventId).toBe("104527");
      expect(shapeErr.endpoint).toContain("live_results_fetch_round");
      expect(shapeErr.message).toContain("104527");
      expect(shapeErr.zodIssues.length).toBeGreaterThan(0);
    }
  });
});
