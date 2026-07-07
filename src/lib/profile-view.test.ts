import { describe, expect, it } from "vitest";

import type { PublicProfilePayload } from "./profile-view";
import {
  buildProfileLinks,
  countLeagueNightRounds,
  olpIneligibilityReason,
  poolBAccrualActive,
  profilePointsFromByType,
  projectProfile,
  splitSkinsPayoutCents,
} from "./profile-view";

function makeProfile(overrides: Partial<PublicProfilePayload> = {}): PublicProfilePayload {
  return {
    holderId: 1,
    name: "Alex Rivera",
    slug: "alex-rivera",
    tagNumber: 5,
    pool: "A",
    pdgaNumber: 12345,
    pdgaMembership: true,
    presentRating: 900,
    poolBAccrual: null,
    olpEligibleCurrent: true,
    olpIneligibleReasonCurrent: null,
    skinsQualified: true,
    skinsIneligibilityReason: null,
    championship: { rank: 2, points: 420, tieBrokenByTag: false },
    subLeagueStandings: {
      EARLY: { rank: 1, points: 180, tieBrokenByTag: false, finalized: true },
      MID: { rank: 3, points: 120, tieBrokenByTag: true, finalized: false },
      LATE: { rank: 0, points: 0, tieBrokenByTag: false, finalized: false },
    },
    points: {
      leagueNight: 300,
      podium: 50,
      tournament: 40,
      fodOpen: 30,
      countedCount: 12,
      droppedCount: 3,
    },
    rounds: [
      {
        eventId: 1,
        date: "2026-05-01",
        type: "LeagueNight",
        subLeague: "EARLY",
        eventLabel: "Early Night",
        roundOrdinal: 1,
        scoreToPar: 2,
        roundRating: 905,
      },
      {
        eventId: 2,
        date: "2026-05-08",
        type: "LeagueNight",
        subLeague: "EARLY",
        eventLabel: "Early Night",
        roundOrdinal: 2,
        scoreToPar: -1,
        roundRating: 910,
      },
    ],
    olpBySubLeague: {
      EARLY: {
        subLeague: "EARLY",
        rank: 2,
        score: 81.3,
        ratingComponent: 85.3,
        avgToPar: 5,
        rounds: 7,
        poolWins: 2,
        payout: 80,
        eligible: true,
        ineligibleReason: null,
        projected: false,
        tieBrokenByTag: false,
      },
      MID: {
        subLeague: "MID",
        rank: null,
        score: 90,
        ratingComponent: 90,
        avgToPar: 0,
        rounds: 2,
        poolWins: 0,
        payout: null,
        eligible: false,
        ineligibleReason: "2 rounds",
        projected: true,
        tieBrokenByTag: false,
      },
      LATE: null,
    },
    moneySkins: {
      rank: 2,
      totalPoints: 420,
      eligible: true,
      qualified: true,
      projectedPayoutCents: 11947,
      purseCents: 47787,
      projected: true,
      ineligibilityReason: null,
    },
    moneyOlp: [
      { subLeague: "EARLY", payout: 80, projected: false },
      { subLeague: "MID", payout: null, projected: true },
      { subLeague: "LATE", payout: null, projected: true },
    ],
    provisional: false,
    updatedAt: "2026-07-01T00:00:00.000Z",
    stale: false,
    pendingReview: 0,
    ...overrides,
  };
}

describe("poolBAccrualActive", () => {
  it("returns null for Pool A", () => {
    expect(poolBAccrualActive("A", 950)).toBeNull();
  });

  it("marks inactive at or above 920 for Pool B", () => {
    expect(poolBAccrualActive("B", 919)).toBe("active");
    expect(poolBAccrualActive("B", 920)).toBe("inactive");
  });
});

describe("olpIneligibilityReason", () => {
  it("mirrors OLP page reasons", () => {
    expect(olpIneligibilityReason({ rounds: 2, eligible: false })).toBe("2 rounds");
    expect(olpIneligibilityReason({ rounds: 4, eligible: false })).toBe(
      "no PDGA membership",
    );
    expect(olpIneligibilityReason({ rounds: 4, eligible: true })).toBeNull();
  });
});

describe("splitSkinsPayoutCents", () => {
  it("splits the purse exactly among qualified holders", () => {
    const shares = [1, 2, 3, 4].map((rank) =>
      splitSkinsPayoutCents(100, 4, rank),
    );
    expect(shares).toEqual([25, 25, 25, 25]);
    expect(shares.reduce<number>((sum, cents) => sum + (cents ?? 0), 0)).toBe(100);
  });
});

describe("buildProfileLinks", () => {
  it("builds spec-aligned deep links", () => {
    expect(buildProfileLinks(2026, "alex-rivera", "A", "mid")).toEqual({
      championship: "/2026/championship/pool-a",
      subLeague: "/2026/sub-league/mid/pool-a",
      scoreSheet: "/2026/score-sheet/pool-a#alex-rivera",
      rounds: "/2026/players/alex-rivera/rounds?league=mid",
      olp: "/2026/olp/mid",
      financialsSkins: "/2026/financials#pots-skins",
      financialsOlp: "/2026/financials#pots-olp",
    });
  });
});

describe("projectProfile", () => {
  it("reconciles championship, points, OLP, and money sections", () => {
    const view = projectProfile(makeProfile(), 2026, "early");
    expect(view.championship.overall).toEqual({
      rank: 2,
      points: 420,
      tieBrokenByTag: false,
    });
    expect(view.points.leagueNight).toBe(300);
    expect(view.points.countedCount).toBe(12);
    expect(view.olp.active.score).toBe(81.3);
    expect(view.olp.active.payout).toBe(80);
    expect(view.money.skins.projectedPayoutCents).toBe(11947);
    expect(view.money.olp[0]!.payout).toBe(80);
  });

  it("scopes rounds to the active sub-league", () => {
    const view = projectProfile(makeProfile(), 2026, "early");
    expect(view.rounds.recentRounds).toHaveLength(2);
    expect(view.rounds.viewFullHref).toBe("/2026/players/alex-rivera/rounds?league=early");
  });
});

describe("profilePointsFromByType", () => {
  it("maps score-sheet subtotals", () => {
    expect(
      profilePointsFromByType(
        { LeagueNight: 10, Podium: 5, Tournament: 3, FODOpen: 2 },
        4,
        1,
      ),
    ).toEqual({
      leagueNight: 10,
      podium: 5,
      tournament: 3,
      fodOpen: 2,
      countedCount: 4,
      droppedCount: 1,
    });
  });
});

describe("countLeagueNightRounds", () => {
  it("counts league-night rounds only", () => {
    expect(
      countLeagueNightRounds([
        {
          eventId: 1,
          date: "2026-05-01",
          type: "LeagueNight",
          subLeague: "EARLY",
          eventLabel: "Night",
          roundOrdinal: 1,
          scoreToPar: 0,
          roundRating: 900,
        },
        {
          eventId: 2,
          date: "2026-06-01",
          type: "Tournament",
          subLeague: null,
          eventLabel: "Open",
          roundOrdinal: null,
          scoreToPar: 0,
          roundRating: 900,
        },
      ]),
    ).toBe(1);
  });
});
