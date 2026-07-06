import { describe, expect, it } from "vitest";

import { buildCanonicalSlugs, type SeasonResults } from "@/lib";
import { buildSkinsViews } from "./skins-build";

function minimalResults(overrides: Partial<SeasonResults> = {}): SeasonResults {
  return {
    seasonYear: 2098,
    championship: { A: [], B: [] },
    subLeagues: { EARLY: { A: [], B: [] }, MID: { A: [], B: [] }, LATE: { A: [], B: [] } },
    scoreSheet: {},
    podium: {
      EARLY: { complete: false, A: [], B: [] },
      MID: { complete: false, A: [], B: [] },
      LATE: { complete: false, A: [], B: [] },
    },
    olpPot: { EARLY: 0, MID: 0, LATE: 0 },
    olp: { EARLY: [], MID: [], LATE: [] },
    skins: { A: [], B: [] },
    financials: {
      funds: {
        reserves: 0,
        ace: 0,
        olp: { EARLY: 0, MID: 0, LATE: 0 },
        skins: { A: 0, B: 0 },
      },
      totalCashCents: 0,
      ledger: [],
      totals: { tagSales: 0, paidEntries: 0, aceEntries: 0 },
      subLeagueComplete: { EARLY: false, MID: false, LATE: false },
      skinsPaidOut: { A: false, B: false },
      projected: true,
    },
    ...overrides,
  };
}

describe("buildSkinsViews", () => {
  it("splits the pool purse exactly among qualified holders", () => {
    const results = minimalResults({
      skins: {
        A: [
          { rank: 1, holderId: 1, tagNumber: 1, totalPoints: 100, eligible: true, qualified: true },
          { rank: 2, holderId: 2, tagNumber: 2, totalPoints: 90, eligible: true, qualified: true },
          { rank: 3, holderId: 3, tagNumber: 3, totalPoints: 80, eligible: true, qualified: true },
          { rank: 4, holderId: 4, tagNumber: 4, totalPoints: 70, eligible: true, qualified: true },
          { rank: 5, holderId: 5, tagNumber: 5, totalPoints: 60, eligible: true, qualified: false },
        ],
        B: [],
      },
      financials: {
        ...minimalResults().financials,
        funds: {
          ...minimalResults().financials.funds,
          skins: { A: 100, B: 0 },
        },
      },
    });
    const nameById = new Map([
      [1, "One"],
      [2, "Two"],
      [3, "Three"],
      [4, "Four"],
      [5, "Five"],
    ]);
    const slugById = buildCanonicalSlugs([
      { id: 1, name: "One", tagNumber: 1 },
      { id: 2, name: "Two", tagNumber: 2 },
      { id: 3, name: "Three", tagNumber: 3 },
      { id: 4, name: "Four", tagNumber: 4 },
      { id: 5, name: "Five", tagNumber: 5 },
    ]);

    const views = buildSkinsViews(
      2098,
      results,
      nameById,
      slugById,
      "2026-07-01T00:00:00.000Z",
      false,
      0,
    );
    const poolA = views[0]!;

    expect(poolA.viewKey).toBe("skins/pool-a");
    const payload = poolA.payload as import("@/lib").PublicSkinsPayload;
    expect(payload.purseCents).toBe(100);
    expect(payload.projected).toBe(true);
    const qualifiedPayouts = payload.rows
      .filter((row) => row.qualified)
      .map((row) => row.projectedPayoutCents);
    expect(qualifiedPayouts).toEqual([25, 25, 25, 25]);
    expect(qualifiedPayouts.reduce<number>((sum, cents) => sum + (cents ?? 0), 0)).toBe(100);
    expect(payload.rows.find((row) => row.holderId === 5)?.projectedPayoutCents).toBeNull();
  });

  it("marks projected false once a skins payout is recorded", () => {
    const results = minimalResults({
      financials: {
        ...minimalResults().financials,
        skinsPaidOut: { A: true, B: false },
      },
    });
    const views = buildSkinsViews(
      2098,
      results,
      new Map<number, string>(),
      new Map<number, string>(),
      "2026-07-01T00:00:00.000Z",
      false,
      0,
    );
    expect((views[0]!.payload as import("@/lib").PublicSkinsPayload).projected).toBe(false);
  });
});
