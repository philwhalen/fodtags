// Priority test (CLAUDE.md "Testing priorities"; specs/12-Architecture.md
// §12.11): the OLP engine must reproduce the two worked examples from
// Spec 02 §2.8 EXACTLY. No DB, no env, no `server-only` — `olpScore` and
// its `OlpInput` type are pure, so this is a plain fixture-in/fixture-out
// unit test.
import { describe, expect, it } from "vitest";

import { entriesToOlpPot, largestRemainderPayout, olpScore } from "@server/engine/olp";
import { roundToOneDecimal } from "@/lib";

describe("olpScore", () => {
  it("worked example 1: 85.3 + 5 - 7 - 2 = 81.3", () => {
    const raw = olpScore({
      ratingOnLastDay: 853,
      avgScoreToPar: 5,
      roundsPlayed: 7,
      leagueNightPoolWins: 2,
    });

    // Raw floating point is documented to land at 81.30000000000001 —
    // assert the rounded display value exactly, and pin the raw value
    // to within a tight tolerance of the true mathematical result.
    expect(roundToOneDecimal(raw)).toBe(81.3);
    expect(raw).toBeCloseTo(81.3, 10);
  });

  it("worked example 2: 93.7 - 3.3 - 6 - 3 = 81.4", () => {
    const raw = olpScore({
      ratingOnLastDay: 937,
      avgScoreToPar: -3.3,
      roundsPlayed: 6,
      leagueNightPoolWins: 3,
    });

    expect(roundToOneDecimal(raw)).toBe(81.4);
    expect(raw).toBeCloseTo(81.4, 10);
  });
});

describe("entriesToOlpPot", () => {
  it("is $1 per paid League-Night entry", () => {
    expect(entriesToOlpPot(0)).toBe(0);
    expect(entriesToOlpPot(37)).toBe(37);
  });
});

describe("largestRemainderPayout", () => {
  it("sums exactly to the pot for evenly-divisible pots", () => {
    const [first, second, third] = largestRemainderPayout(100);
    expect([first, second, third]).toEqual([50, 30, 20]);
    expect(first + second + third).toBe(100);
  });

  it("sums exactly to the pot for a pot not divisible by 10 (101)", () => {
    const shares = largestRemainderPayout(101);
    // 50.5 / 30.3 / 20.2 -> floors 50/30/20 (=100), 1 leftover dollar goes
    // to the largest fractional remainder (1st place's .5).
    expect(shares).toEqual([51, 30, 20]);
    expect(shares[0] + shares[1] + shares[2]).toBe(101);
  });

  it("sums exactly to the pot for a pot not divisible by 10 (103)", () => {
    const shares = largestRemainderPayout(103);
    // 51.5 / 30.9 / 20.6 -> floors 51/30/20 (=101), 2 leftover dollars go
    // to the two largest fractional remainders (2nd's .9, then 3rd's .6).
    expect(shares).toEqual([51, 31, 21]);
    expect(shares[0] + shares[1] + shares[2]).toBe(103);
  });

  it("sums exactly to the pot across a wide range of values", () => {
    for (let pot = 0; pot <= 250; pot++) {
      const [first, second, third] = largestRemainderPayout(pot);
      expect(first + second + third).toBe(pot);
    }
  });
});
