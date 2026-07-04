// Priority test (CLAUDE.md "Testing priorities"; specs/12-Architecture.md
// §12.11): the OLP engine must reproduce the two worked examples from
// Spec 02 §2.8 EXACTLY. No DB, no env, no `server-only` — `olpScore` and
// its `OlpInput` type are pure, so this is a plain fixture-in/fixture-out
// unit test.
import { describe, expect, it } from "vitest";

import { olpScore } from "@server/engine/olp";
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
