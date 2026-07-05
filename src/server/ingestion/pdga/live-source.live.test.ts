import { describe, expect, it } from "vitest";

import { liveSource } from "@server/ingestion/pdga/live-source";

const isLive = process.env.PDGA_SOURCE === "live";

describe.skipIf(!isLive)("liveSource.fetchEvent (network)", () => {
  it("fetchEvent(104527) returns at least 7 completed rounds", async () => {
    const payload = await liveSource.fetchEvent("104527");

    expect(payload.pdgaEventId).toBe("104527");
    expect(payload.rounds.length).toBeGreaterThanOrEqual(7);
    expect(payload.meta.HighestCompletedRound).toBeGreaterThanOrEqual(7);
  });
});
