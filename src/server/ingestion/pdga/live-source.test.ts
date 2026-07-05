import { describe, expect, it } from "vitest";

import { fixtureSource } from "@server/ingestion/pdga/fixture-source";

describe("fixtureSource.fetchEvent (104527)", () => {
  it("returns 7 rounds with MA1 division and expected round-7 leader fields", async () => {
    const payload = await fixtureSource.fetchEvent("104527");

    expect(payload.pdgaEventId).toBe("104527");
    expect(payload.meta.HighestCompletedRound).toBe(7);
    expect(payload.meta.FinalRound).toBe(10);
    expect(payload.meta.EndDate).toBe("2026-07-23");
    expect(payload.divisions).toHaveLength(1);
    expect(payload.divisions[0]?.Division).toBe("MA1");
    expect(payload.rounds).toHaveLength(7);

    const round7 = payload.rounds.find((r) => r.Round === 7);
    expect(round7).toBeDefined();
    expect(round7?.scores).toHaveLength(12);

    const leader = round7?.scores.find((s) => s.RunningPlace === 1);
    expect(leader).toMatchObject({
      PDGANum: 211843,
      RoundtoPar: -8,
      RoundRating: 989,
      Rating: 952,
      Completed: 1,
      HasRoundScore: 1,
    });
  });
});
