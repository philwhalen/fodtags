import { describe, expect, it } from "vitest";

import { fixtureSource } from "@server/ingestion/pdga/fixture-source";
import type { RawEventPayload } from "@server/ingestion/pdga/source";
import {
  deriveEventDate,
  normalize,
  RoundAttributionError,
} from "@server/ingestion/normalize";

describe("normalize (104527 fixtures)", () => {
  it("maps round 7 to 12 entrants with correct leader fields", async () => {
    const payload = await fixtureSource.fetchEvent("104527");
    const result = normalize(payload, "MID");

    expect(result.pdgaEventId).toBe("104527");
    expect(result.sourceType).toBe("MID");
    expect(result.rounds).toHaveLength(7);

    const round7 = result.rounds.find((r) => r.roundOrdinal === 7);
    expect(round7).toBeDefined();
    expect(round7?.eventDate).toBe("2026-07-02");
    expect(round7?.entrants).toHaveLength(12);

    const leader = round7?.entrants.find((e) => e.pdgaNumber === 211843);
    expect(leader).toMatchObject({
      displayName: "Anthony D\u2019Aiuto",
      rawScoreToPar: -8,
      roundRating: 989,
      playerRatingReported: 952,
      roundFinal: true,
      runningPlace: 1,
      wonPlayoff: false,
      profileUrl: "https://www.pdga.com/player/211843",
    });
  });

  it("omits a player who did not play round 6", async () => {
    const payload = await fixtureSource.fetchEvent("104527");
    const result = normalize(payload, "MID");

    const round6 = result.rounds.find((r) => r.roundOrdinal === 6);
    expect(round6).toBeDefined();
    expect(round6?.entrants.some((e) => e.pdgaNumber === 211843)).toBe(false);

    const round7 = result.rounds.find((r) => r.roundOrdinal === 7);
    expect(round7?.entrants.some((e) => e.pdgaNumber === 211843)).toBe(true);
  });

  it("throws RoundAttributionError for an out-of-range round", async () => {
    const payload = await fixtureSource.fetchEvent("104527");
    const doctored: RawEventPayload = {
      ...payload,
      rounds: [
        ...payload.rounds,
        {
          Division: "MA1",
          Round: 11,
          scores: [],
        },
      ],
    };

    expect(() => normalize(doctored, "MID")).toThrow(RoundAttributionError);
  });

  it("normalizes a guest entrant with pdgaNumber null", async () => {
    const payload = await fixtureSource.fetchEvent("104527");
    const result = normalize(payload, "MID");

    const round1 = result.rounds.find((r) => r.roundOrdinal === 1);
    const guest = round1?.entrants.find((e) => e.displayName === "Nick Pixley");
    expect(guest).toMatchObject({
      pdgaNumber: null,
      displayName: "Nick Pixley",
    });
  });
});

describe("deriveEventDate", () => {
  it("advances one Thursday per round from StartDate", () => {
    expect(deriveEventDate("2026-05-21", 1)).toBe("2026-05-21");
    expect(deriveEventDate("2026-05-21", 7)).toBe("2026-07-02");
    expect(deriveEventDate("2026-05-21", 10)).toBe("2026-07-23");
  });
});
