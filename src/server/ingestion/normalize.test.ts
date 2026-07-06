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

  it("omits a row with a null RoundtoPar instead of failing the round", async () => {
    // Real PDGA data (e.g. event 102021 MA3 R5) carries null RoundtoPar/ToPar
    // for registered players with no score that round. Such a row must be
    // dropped, not crash normalization.
    const payload = await fixtureSource.fetchEvent("104527");
    const round1 = payload.rounds.find((r) => r.Round === 1);
    if (!round1) throw new Error("fixture missing round 1");
    const sample = round1.scores[0];
    if (!sample) throw new Error("fixture round 1 has no scores");
    const doctored: RawEventPayload = {
      ...payload,
      rounds: payload.rounds.map((r) =>
        r.Round === 1
          ? {
              ...r,
              scores: [
                ...r.scores,
                { ...sample, Name: "No Score Ghost", PDGANum: 999999, RoundtoPar: null, ToPar: null },
              ],
            }
          : r,
      ),
    };

    const result = normalize(doctored, "MID");
    const round1Out = result.rounds.find((r) => r.roundOrdinal === 1);
    expect(round1Out?.entrants.some((e) => e.displayName === "No Score Ghost")).toBe(false);
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
