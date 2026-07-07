import { describe, expect, it } from "vitest";

import { match, type MatchableHolder, type StickyMatch } from "@server/ingestion/match";
import type { NormalizedEntrantResult } from "@server/ingestion/normalize";

function entrant(overrides: Partial<NormalizedEntrantResult> = {}): NormalizedEntrantResult {
  return {
    pdgaNumber: 12345,
    displayName: "Test Player",
    rawScoreToPar: 0,
    roundRating: null,
    playerRatingReported: null,
    roundFinal: true,
    runningPlace: 1,
    wonPlayoff: false,
    profileUrl: null,
    ...overrides,
  };
}

const holders: MatchableHolder[] = [
  { id: 1, name: "Alice Holder", pdgaNumber: 111111 },
  { id: 2, name: "Bob Holder", pdgaNumber: 222222 },
  { id: 3, name: "Charlie Holder", pdgaNumber: null },
];

describe("match", () => {
  it("links by exact PDGA# even when display names differ", () => {
    const result = match(
      [entrant({ pdgaNumber: 111111, displayName: "Different Name On PDGA" })],
      holders,
      new Map(),
    );

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.holderId).toBe(1);
    expect(result.autoLinks).toEqual([{ pdgaNumber: 111111, holderId: 1 }]);
    expect(result.unmatched).toHaveLength(0);
  });

  it("links by unique normalized name when PDGA# does not hit", () => {
    const result = match(
      [entrant({ pdgaNumber: 999999, displayName: "Charlie Holder" })],
      holders,
      new Map(),
    );

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.holderId).toBe(3);
    expect(result.autoLinks).toEqual([{ pdgaNumber: 999999, holderId: 3 }]);
  });

  it("queues ambiguous when two holders share a normalized name", () => {
    const ambiguousHolders: MatchableHolder[] = [
      ...holders,
      { id: 4, name: "Alice Holder", pdgaNumber: 333333 },
    ];

    const result = match(
      [entrant({ pdgaNumber: 999999, displayName: "Alice Holder" })],
      ambiguousHolders,
      new Map(),
    );

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]?.reason).toBe("ambiguous");
    expect(result.autoLinks).toHaveLength(0);
  });

  it("classifies a PDGA#-having entrant with zero name hits as an auto-add candidate", () => {
    const result = match(
      [entrant({ pdgaNumber: 999999, displayName: "Nobody Here" })],
      holders,
      new Map(),
    );

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0);
    expect(result.autoAdds).toHaveLength(1);
    expect(result.autoAdds[0]).toEqual({
      entrant: expect.objectContaining({ pdgaNumber: 999999, displayName: "Nobody Here" }),
      pdgaNumber: 999999,
    });
  });

  it("queues guests without PDGA number as no-pdga-number-match", () => {
    const result = match(
      [entrant({ pdgaNumber: null, displayName: "Guest Player" })],
      holders,
      new Map(),
    );

    expect(result.unmatched).toHaveLength(1);
    expect(result.unmatched[0]?.reason).toBe("no-pdga-number-match");
  });

  it("skips sticky non-holder entries — neither matched nor queued", () => {
    const sticky = new Map<number, StickyMatch>([[555555, { holderId: null, source: "admin" }]]);

    const result = match(
      [entrant({ pdgaNumber: 555555, displayName: "Non Holder" })],
      holders,
      sticky,
    );

    expect(result.matched).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0);
    expect(result.autoLinks).toHaveLength(0);
  });

  it("applies sticky admin link over what PDGA# auto-match would pick", () => {
    const sticky = new Map<number, StickyMatch>([[111111, { holderId: 2, source: "admin" }]]);

    const result = match(
      [entrant({ pdgaNumber: 111111, displayName: "Alice Holder" })],
      holders,
      sticky,
    );

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.holderId).toBe(2);
    expect(result.autoLinks).toHaveLength(0);
  });
});
