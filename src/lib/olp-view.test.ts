// Pure unit tests for the OLP view projection (Spec 06 §6.2/§6.3;
// plans/olp-pot/01-pure-helpers.md).
import { describe, expect, it } from "vitest";

import { buildOlpLinks, projectOlp } from "./olp-view";
import type { PublicOlpPayload } from "./olp-view";
import type { OlpRow } from "./season-results";

function row(overrides: Partial<OlpRow> & Pick<OlpRow, "holderId" | "tagNumber">): OlpRow & {
  name: string;
  slug: string;
} {
  return {
    rank: 1,
    score: 0,
    ratingComponent: 0,
    avgToPar: 0,
    rounds: 4,
    poolWins: 0,
    eligible: true,
    payout: null,
    projected: true,
    tieBrokenByTag: false,
    name: `Holder ${overrides.holderId}`,
    slug: `holder-${overrides.holderId}`,
    ...overrides,
  };
}

function payload(rows: (OlpRow & { name: string; slug: string })[], overrides: Partial<PublicOlpPayload> = {}): PublicOlpPayload {
  return {
    subLeague: "MID",
    rows,
    pot: 0,
    projected: true,
    updatedAt: "2026-06-01T00:00:00.000Z",
    stale: false,
    pendingReview: 0,
    ...overrides,
  };
}

describe("projectOlp — reconciliation", () => {
  it("reconciles 85.3 + 5 - 7 - 2 = 81.3", () => {
    const r = row({
      holderId: 1,
      tagNumber: 10,
      ratingComponent: 85.3,
      avgToPar: 5,
      rounds: 7,
      poolWins: 2,
      score: 85.3 + 5 - 7 - 2,
    });
    const projection = projectOlp(payload([r]));
    expect(projection.ranked).toHaveLength(1);
    const ranked = projection.ranked[0]!;
    expect(ranked.ratingComponent).toBe(85.3);
    expect(ranked.avgToPar).toBe(5);
    expect(ranked.rounds).toBe(7);
    expect(ranked.poolWins).toBe(2);
    expect(ranked.score).toBe(81.3);
    expect(
      roundTo1(ranked.ratingComponent + ranked.avgToPar - ranked.rounds - ranked.poolWins),
    ).toBe(ranked.score);
  });

  it("reconciles 93.7 - 3.3 - 6 - 3 = 81.4", () => {
    const r = row({
      holderId: 2,
      tagNumber: 11,
      ratingComponent: 93.7,
      avgToPar: -3.3,
      rounds: 6,
      poolWins: 3,
      score: 93.7 - 3.3 - 6 - 3,
    });
    const projection = projectOlp(payload([r]));
    expect(projection.ranked).toHaveLength(1);
    const ranked = projection.ranked[0]!;
    expect(ranked.ratingComponent).toBe(93.7);
    expect(ranked.avgToPar).toBe(-3.3);
    expect(ranked.rounds).toBe(6);
    expect(ranked.poolWins).toBe(3);
    expect(ranked.score).toBe(81.4);
    expect(
      roundTo1(ranked.ratingComponent + ranked.avgToPar - ranked.rounds - ranked.poolWins),
    ).toBe(ranked.score);
  });
});

function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

describe("projectOlp — eligible-only ranking", () => {
  it("ranks only eligible rows 1..N; a best-score ineligible row does not take rank 1", () => {
    const rows = [
      row({ holderId: 1, tagNumber: 1, score: 70, eligible: false, rounds: 2 }),
      row({ holderId: 2, tagNumber: 2, score: 75, eligible: true }),
      row({ holderId: 3, tagNumber: 3, score: 80, eligible: true }),
      row({ holderId: 4, tagNumber: 4, score: 90, eligible: false, rounds: 5 }),
    ];
    const projection = projectOlp(payload(rows));
    expect(projection.ranked.map((r) => r.holderId)).toEqual([2, 3]);
    expect(projection.ranked.map((r) => r.displayRank)).toEqual([1, 2]);
    expect(projection.notEligible.map((r) => r.holderId)).toEqual([1, 4]);
    expect(projection.notEligible.every((r) => r.displayRank === null)).toBe(true);
  });
});

describe("projectOlp — split + reason", () => {
  it("derives plural/singular round reasons and 'no PDGA' for >=4 rounds", () => {
    const rows = [
      row({ holderId: 1, tagNumber: 1, eligible: false, rounds: 3 }),
      row({ holderId: 2, tagNumber: 2, eligible: false, rounds: 1 }),
      row({ holderId: 3, tagNumber: 3, eligible: false, rounds: 5 }),
      row({ holderId: 4, tagNumber: 4, eligible: true, rounds: 6 }),
    ];
    const projection = projectOlp(payload(rows));
    const byId = new Map(projection.notEligible.map((r) => [r.holderId, r.ineligibleReason]));
    expect(byId.get(1)).toBe("3 rounds");
    expect(byId.get(2)).toBe("1 round");
    expect(byId.get(3)).toBe("no PDGA");

    // Every input row is covered exactly once across the two sections.
    const allIds = [...projection.ranked, ...projection.notEligible].map((r) => r.holderId).sort();
    expect(allIds).toEqual([1, 2, 3, 4]);
    expect(projection.ranked.map((r) => r.holderId)).toEqual([4]);
    expect(projection.ranked[0]?.ineligibleReason).toBeUndefined();
  });
});

describe("projectOlp — payout passthrough", () => {
  it("keeps engine payouts for eligible ranks 1-3; null for rank 4 and not-eligible rows", () => {
    const rows = [
      row({ holderId: 1, tagNumber: 1, eligible: true, payout: 50 }),
      row({ holderId: 2, tagNumber: 2, eligible: true, payout: 30 }),
      row({ holderId: 3, tagNumber: 3, eligible: true, payout: 20 }),
      row({ holderId: 4, tagNumber: 4, eligible: true, payout: null }),
      row({ holderId: 5, tagNumber: 5, eligible: false, payout: null, rounds: 2 }),
    ];
    const projection = projectOlp(payload(rows, { pot: 100 }));
    expect(projection.ranked.map((r) => r.payout)).toEqual([50, 30, 20, null]);
    expect(projection.notEligible.map((r) => r.payout)).toEqual([null]);
    expect(projection.pot).toBe(100);
  });

  it("returns only present ranks' payouts when fewer than 3 are eligible", () => {
    const rows = [
      row({ holderId: 1, tagNumber: 1, eligible: true, payout: 60 }),
      row({ holderId: 2, tagNumber: 2, eligible: true, payout: 40 }),
    ];
    const projection = projectOlp(payload(rows, { pot: 100 }));
    expect(projection.ranked.map((r) => r.payout)).toEqual([60, 40]);
    expect(projection.pot).toBe(100);
  });

  it("returns an empty ranked list with pot still present when 0 are eligible", () => {
    const rows = [row({ holderId: 1, tagNumber: 1, eligible: false, payout: null, rounds: 1 })];
    const projection = projectOlp(payload(rows, { pot: 100 }));
    expect(projection.ranked).toEqual([]);
    expect(projection.pot).toBe(100);
  });
});

describe("projectOlp — tie-break passthrough", () => {
  it("passes tieBrokenByTag through unchanged", () => {
    const rows = [
      row({ holderId: 1, tagNumber: 1, eligible: true, tieBrokenByTag: true }),
      row({ holderId: 2, tagNumber: 2, eligible: false, tieBrokenByTag: false, rounds: 1 }),
    ];
    const projection = projectOlp(payload(rows));
    expect(projection.ranked[0]?.tieBrokenByTag).toBe(true);
    expect(projection.notEligible[0]?.tieBrokenByTag).toBe(false);
  });
});

describe("buildOlpLinks", () => {
  it("returns the three /{season}/olp/{slug} hrefs", () => {
    expect(buildOlpLinks("2026")).toEqual({
      early: "/2026/olp/early",
      mid: "/2026/olp/mid",
      late: "/2026/olp/late",
    });
  });
});
