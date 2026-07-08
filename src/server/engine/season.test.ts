// Priority tests (CLAUDE.md "Testing priorities"; Spec 02 acceptance
// criteria): `computeSeason` is pure — plain fixture in, plain fixture
// out — so every fixture here is a hand-calculation reproduction, no DB
// or env required.
import { describe, expect, it } from "vitest";

import { computeSeason } from "@server/engine/season";
import type { SeasonSnapshot, SeasonSnapshotEvent, SeasonSnapshotHolder } from "@/lib";
import { roundToOneDecimal } from "@/lib";

const SEASON_YEAR = 2026;

function holder(overrides: Partial<SeasonSnapshotHolder> & { id: number }): SeasonSnapshotHolder {
  return {
    tagNumber: overrides.id,
    basePool: "A",
    entryDate: "2026-01-01",
    pdgaNumber: null,
    pdgaMembership: false,
    ratingAtEntry: null,
    active: true,
    ...overrides,
  };
}

function leagueNight(
  overrides: Partial<SeasonSnapshotEvent> & { id: number; results: SeasonSnapshotEvent["results"] },
): SeasonSnapshotEvent {
  return {
    sourceType: "EARLY",
    type: "LeagueNight",
    eventDate: "2026-05-01",
    roundOrdinal: 1,
    canceled: false,
    ...overrides,
  };
}

function baseSnapshot(overrides: Partial<SeasonSnapshot> = {}): SeasonSnapshot {
  return {
    seasonYear: SEASON_YEAR,
    holders: [],
    poolSwitches: [],
    tagOverrides: [],
    ratings: [],
    subLeagues: [
      { type: "EARLY", startDate: "2026-05-01", endDate: "2026-06-01", complete: false },
      { type: "MID", startDate: "2026-06-15", endDate: "2026-07-15", complete: false },
      { type: "LATE", startDate: "2026-08-01", endDate: "2026-09-01", complete: false },
    ],
    tournamentSourceCount: 2,
    events: [],
    entryCounts: [],
    ...overrides,
  };
}

describe("computeSeason — Table 2.1 points across event types", () => {
  it("awards League Night, Tournament, and FOD Open points by finish position, per pool", () => {
    const holders = [1, 2, 3].map((id) => holder({ id }));
    const snapshot = baseSnapshot({
      holders,
      events: [
        leagueNight({
          id: 1,
          results: [
            { holderId: 1, rawScoreToPar: -5, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: -2, roundRating: null, tagPresent: true },
            { holderId: 3, rawScoreToPar: 0, roundRating: null, tagPresent: true },
          ],
        }),
        {
          id: 2,
          sourceType: "TOURNAMENT",
          type: "Tournament",
          eventDate: "2026-05-10",
          roundOrdinal: null,
          canceled: false,
          results: [
            { holderId: 1, rawScoreToPar: -5, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: -2, roundRating: null, tagPresent: true },
            { holderId: 3, rawScoreToPar: 0, roundRating: null, tagPresent: true },
          ],
        },
        {
          id: 3,
          sourceType: "FOD_OPEN",
          type: "FODOpen",
          eventDate: "2026-10-01",
          roundOrdinal: null,
          canceled: false,
          results: [
            { holderId: 1, rawScoreToPar: -5, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: -2, roundRating: null, tagPresent: true },
            { holderId: 3, rawScoreToPar: 0, roundRating: null, tagPresent: true },
          ],
        },
      ],
    });

    const result = computeSeason(snapshot);
    const sheet = (id: number) => result.scoreSheet[id]!;

    expect(sheet(1).byType.LeagueNight).toBe(100);
    expect(sheet(2).byType.LeagueNight).toBe(60);
    expect(sheet(3).byType.LeagueNight).toBe(35);

    expect(sheet(1).byType.Tournament).toBe(150);
    expect(sheet(2).byType.Tournament).toBe(100);
    expect(sheet(3).byType.Tournament).toBe(70);

    expect(sheet(1).byType.FODOpen).toBe(250);
    expect(sheet(2).byType.FODOpen).toBe(180);
    expect(sheet(3).byType.FODOpen).toBe(150);
  });

  it("ranks Pool A and Pool B separately, each with their own 1st place", () => {
    const holders = [
      holder({ id: 1, basePool: "A", tagNumber: 1 }),
      holder({ id: 2, basePool: "B", tagNumber: 2 }),
    ];
    const snapshot = baseSnapshot({
      holders,
      events: [
        leagueNight({
          id: 1,
          results: [
            { holderId: 1, rawScoreToPar: -5, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: 3, roundRating: null, tagPresent: true },
          ],
        }),
      ],
    });

    const result = computeSeason(snapshot);
    // Both are 1st in their own pool despite very different raw scores.
    expect(result.scoreSheet[1]!.total).toBe(100);
    expect(result.scoreSheet[2]!.total).toBe(100);
  });
});

describe("computeSeason — top-N caps", () => {
  it("counts only the best 15 League Nights, dropping the rest", () => {
    const h = holder({ id: 1, tagNumber: 1 });
    const events: SeasonSnapshotEvent[] = Array.from({ length: 18 }, (_, i) =>
      leagueNight({
        id: i + 1,
        eventDate: `2026-05-${String(i + 1).padStart(2, "0")}`,
        roundOrdinal: i + 1,
        // Vary rank so points differ: alternate 1st (100) / 2nd (60) via a
        // second, always-losing filler holder.
        results: [
          { holderId: 1, rawScoreToPar: i % 2 === 0 ? -10 : 5, roundRating: null, tagPresent: true },
          { holderId: 2, rawScoreToPar: 0, roundRating: null, tagPresent: true },
        ],
      }),
    );
    const snapshot = baseSnapshot({ holders: [h, holder({ id: 2, tagNumber: 2 })], events });

    const result = computeSeason(snapshot);
    const sheet = result.scoreSheet[1]!;
    const leagueNightItems = sheet.countedLineItems.filter((i) => i.type === "LeagueNight");
    const droppedLn = sheet.droppedLineItems.filter(
      (i) => i.type === "LeagueNight" && i.droppedReason === "cap",
    );

    expect(leagueNightItems).toHaveLength(15);
    expect(droppedLn).toHaveLength(3);
    // The 9 nights at 1st (100 pts) must all be counted; only 2nd-place
    // (60 pt) nights get dropped to make 15.
    expect(leagueNightItems.filter((i) => i.points === 100)).toHaveLength(9);
    expect(leagueNightItems.filter((i) => i.points === 60)).toHaveLength(6);
    expect(droppedLn.every((i) => i.points === 60)).toBe(true);
  });

  it("caps tournaments at best-2 when <=3 sources, best-3 when >3", () => {
    const h = holder({ id: 1, tagNumber: 1 });
    const other = holder({ id: 2, tagNumber: 2 });
    const tournamentEvent = (id: number, place: "win" | "lose"): SeasonSnapshotEvent => ({
      id,
      sourceType: "TOURNAMENT",
      type: "Tournament",
      eventDate: `2026-0${id}-01`,
      roundOrdinal: null,
      canceled: false,
      results: [
        {
          holderId: 1,
          rawScoreToPar: place === "win" ? -10 : -1,
          roundRating: null,
          tagPresent: true,
        },
        { holderId: 2, rawScoreToPar: -5, roundRating: null, tagPresent: true },
      ],
    });

    const events = [
      tournamentEvent(1, "win"),
      tournamentEvent(2, "win"),
      tournamentEvent(3, "lose"),
      tournamentEvent(4, "lose"),
    ];

    const twoSourceResult = computeSeason(
      baseSnapshot({ holders: [h, other], events, tournamentSourceCount: 3 }),
    );
    const twoSourceItems = twoSourceResult.scoreSheet[1]!.countedLineItems.filter(
      (i) => i.type === "Tournament",
    );
    expect(twoSourceItems).toHaveLength(2);
    expect(twoSourceItems.every((i) => i.points === 150)).toBe(true);

    const threeSourceResult = computeSeason(
      baseSnapshot({ holders: [h, other], events, tournamentSourceCount: 4 }),
    );
    const threeSourceItems = threeSourceResult.scoreSheet[1]!.countedLineItems.filter(
      (i) => i.type === "Tournament",
    );
    expect(threeSourceItems).toHaveLength(3);
  });
});

describe("computeSeason — cancellations and eligibility", () => {
  it("awards zero points everywhere for a canceled League Night", () => {
    const h = holder({ id: 1, tagNumber: 1 });
    const snapshot = baseSnapshot({
      holders: [h],
      events: [
        leagueNight({
          id: 1,
          canceled: true,
          results: [{ holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true }],
        }),
      ],
    });

    const result = computeSeason(snapshot);
    expect(result.scoreSheet[1]!.total).toBe(0);
    expect(result.scoreSheet[1]!.countedLineItems).toHaveLength(0);
    expect(result.scoreSheet[1]!.droppedLineItems).toHaveLength(0);
  });

  it("excludes a result where the holder's tag was not present", () => {
    const h = holder({ id: 1, tagNumber: 1 });
    const other = holder({ id: 2, tagNumber: 2 });
    const snapshot = baseSnapshot({
      holders: [h, other],
      events: [
        leagueNight({
          id: 1,
          results: [
            { holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: false },
            { holderId: 2, rawScoreToPar: 0, roundRating: null, tagPresent: true },
          ],
        }),
      ],
    });

    const result = computeSeason(snapshot);
    expect(result.scoreSheet[1]!.total).toBe(0);
    expect(result.scoreSheet[1]!.countedLineItems).toHaveLength(0);
    // The remaining present holder becomes the sole ranked (1st place)
    // finisher — excluded, not just zero-pointed.
    expect(result.scoreSheet[2]!.total).toBe(100);
  });

  it("excludes finishes before the holder's entry date but counts an on-date finish", () => {
    const h = holder({ id: 1, tagNumber: 1, entryDate: "2026-05-05" });
    const snapshot = baseSnapshot({
      holders: [h],
      events: [
        leagueNight({
          id: 1,
          eventDate: "2026-05-04",
          results: [{ holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true }],
        }),
        leagueNight({
          id: 2,
          eventDate: "2026-05-05",
          roundOrdinal: 2,
          results: [{ holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true }],
        }),
      ],
    });

    const result = computeSeason(snapshot);
    expect(result.scoreSheet[1]!.countedLineItems).toHaveLength(1);
    expect(result.scoreSheet[1]!.countedLineItems[0]!.eventDate).toBe("2026-05-05");
    expect(result.scoreSheet[1]!.total).toBe(100);
  });

  it("gates Pool B point accrual at a 920 rating as-of the event date", () => {
    const h = holder({ id: 1, tagNumber: 1, basePool: "B", ratingAtEntry: 850 });
    const snapshot = baseSnapshot({
      holders: [h],
      ratings: [
        { holderId: 1, effectiveDate: "2026-04-01", rating: 850, official: true },
        { holderId: 1, effectiveDate: "2026-06-01", rating: 925, official: true },
      ],
      events: [
        leagueNight({
          id: 1,
          eventDate: "2026-05-01",
          results: [{ holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true }],
        }),
        leagueNight({
          id: 2,
          eventDate: "2026-06-15",
          roundOrdinal: 2,
          results: [{ holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true }],
        }),
      ],
    });

    const result = computeSeason(snapshot);
    const items = result.scoreSheet[1]!.countedLineItems.filter((i) => i.type === "LeagueNight");
    const may1 = items.find((i) => i.eventDate === "2026-05-01");
    const jun15 = items.find((i) => i.eventDate === "2026-06-15");
    expect(may1?.points).toBe(100); // rated 850 (<920): earns points
    expect(jun15?.points).toBe(0); // rated 925 (>=920): gated to zero
  });
});

describe("computeSeason — pool switches forfeit prior points", () => {
  it("zeroes out points earned before a pool switch's effective date", () => {
    const h = holder({ id: 1, tagNumber: 1, basePool: "A" });
    const snapshot = baseSnapshot({
      holders: [h],
      poolSwitches: [{ holderId: 1, effectiveDate: "2026-05-15", toPool: "B" }],
      events: [
        leagueNight({
          id: 1,
          eventDate: "2026-05-01",
          results: [{ holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true }],
        }),
        leagueNight({
          id: 2,
          eventDate: "2026-05-20",
          roundOrdinal: 2,
          results: [{ holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true }],
        }),
      ],
    });

    const result = computeSeason(snapshot);
    const sheet = result.scoreSheet[1]!;
    expect(sheet.total).toBe(100); // only the post-switch night counts
    expect(sheet.countedLineItems).toHaveLength(1);
    expect(sheet.countedLineItems[0]!.eventDate).toBe("2026-05-20");
    const forfeitedItem = sheet.droppedLineItems.find((i) => i.droppedReason === "forfeited");
    expect(forfeitedItem?.eventDate).toBe("2026-05-01");
    expect(forfeitedItem?.points).toBe(100); // the raw points that were forfeited
  });
});

describe("computeSeason — computed Podium and tie-breaks", () => {
  it("awards 150/100/50 to the top 3 per pool by accumulated sub-league League-Night points, once complete", () => {
    const holders = [1, 2, 3, 4].map((id) => holder({ id, tagNumber: id }));
    const events: SeasonSnapshotEvent[] = [
      leagueNight({
        id: 1,
        eventDate: "2026-05-01",
        results: [
          { holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true },
          { holderId: 2, rawScoreToPar: -5, roundRating: null, tagPresent: true },
          { holderId: 3, rawScoreToPar: -1, roundRating: null, tagPresent: true },
          { holderId: 4, rawScoreToPar: 5, roundRating: null, tagPresent: true },
        ],
      }),
      leagueNight({
        id: 2,
        eventDate: "2026-05-08",
        roundOrdinal: 2,
        results: [
          { holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true },
          { holderId: 2, rawScoreToPar: -5, roundRating: null, tagPresent: true },
          { holderId: 3, rawScoreToPar: -1, roundRating: null, tagPresent: true },
          { holderId: 4, rawScoreToPar: 5, roundRating: null, tagPresent: true },
        ],
      }),
    ];

    const snapshot = baseSnapshot({
      holders,
      events,
      subLeagues: [
        { type: "EARLY", startDate: "2026-05-01", endDate: "2026-05-08", complete: true },
        { type: "MID", startDate: "2026-06-15", endDate: "2026-07-15", complete: false },
        { type: "LATE", startDate: "2026-08-01", endDate: "2026-09-01", complete: false },
      ],
    });

    const result = computeSeason(snapshot);
    const earlyPodium = result.podium.EARLY;

    expect(earlyPodium.complete).toBe(true);
    expect(earlyPodium.A.map((r) => [r.holderId, r.totalPoints])).toEqual([
      [1, 150],
      [2, 100],
      [3, 50],
    ]);
    // 4th place earns no podium bonus.
    expect(earlyPodium.A.some((r) => r.holderId === 4)).toBe(false);

    // Folded into the Championship total: holder 1 earned 200 League-Night
    // points (2 x 100) + 150 podium = 350.
    expect(result.scoreSheet[1]!.total).toBe(350);
    expect(result.scoreSheet[1]!.byType.Podium).toBe(150);

    // Not yet added to the Championship for an incomplete sub-league.
    expect(result.podium.MID.complete).toBe(false);
    expect(result.podium.MID.A).toHaveLength(0);
  });

  it("breaks a League-Night scoring tie by the lower tag number", () => {
    const holders = [
      holder({ id: 1, tagNumber: 5 }),
      holder({ id: 2, tagNumber: 2 }),
    ];
    const snapshot = baseSnapshot({
      holders,
      events: [
        leagueNight({
          id: 1,
          results: [
            { holderId: 1, rawScoreToPar: -5, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: -5, roundRating: null, tagPresent: true },
          ],
        }),
      ],
    });

    const result = computeSeason(snapshot);
    const items1 = result.scoreSheet[1]!.countedLineItems;
    const items2 = result.scoreSheet[2]!.countedLineItems;

    // Tag #2 (holder 2) wins the tie despite an identical score.
    expect(items2[0]!.rank).toBe(1);
    expect(items2[0]!.points).toBe(100);
    expect(items2[0]!.tieBrokenByTag).toBe(true);
    expect(items1[0]!.rank).toBe(2);
    expect(items1[0]!.points).toBe(60);
    expect(items1[0]!.tieBrokenByTag).toBe(true);
  });

  it("ranks a numbered holder ahead of a tied provisional (tagless) holder", () => {
    const holders = [
      holder({ id: 1, tagNumber: null }),
      holder({ id: 2, tagNumber: 2 }),
    ];
    const snapshot = baseSnapshot({
      holders,
      events: [
        leagueNight({
          id: 1,
          results: [
            { holderId: 1, rawScoreToPar: -5, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: -5, roundRating: null, tagPresent: true },
          ],
        }),
      ],
    });

    const result = computeSeason(snapshot);
    const items1 = result.scoreSheet[1]!.countedLineItems;
    const items2 = result.scoreSheet[2]!.countedLineItems;

    // Numbered holder 2 wins the tie over tagless (provisional) holder 1.
    expect(items2[0]!.rank).toBe(1);
    expect(items2[0]!.points).toBe(100);
    expect(items1[0]!.rank).toBe(2);
    expect(items1[0]!.points).toBe(60);
  });

  it("breaks a tie between two tagless (provisional) holders by holder ID", () => {
    const holders = [
      holder({ id: 2, tagNumber: null }),
      holder({ id: 1, tagNumber: null }),
    ];
    const snapshot = baseSnapshot({
      holders,
      events: [
        leagueNight({
          id: 1,
          results: [
            { holderId: 2, rawScoreToPar: -5, roundRating: null, tagPresent: true },
            { holderId: 1, rawScoreToPar: -5, roundRating: null, tagPresent: true },
          ],
        }),
      ],
    });

    const result = computeSeason(snapshot);
    const items1 = result.scoreSheet[1]!.countedLineItems;
    const items2 = result.scoreSheet[2]!.countedLineItems;

    // Lower holder ID (1) wins the tie over holder 2 — both tagless.
    expect(items1[0]!.rank).toBe(1);
    expect(items1[0]!.points).toBe(100);
    expect(items2[0]!.rank).toBe(2);
    expect(items2[0]!.points).toBe(60);
  });
});

describe("computeSeason — score sheet totals", () => {
  it("sums counted line items to exactly the Championship total, for every holder", () => {
    const holders = [1, 2, 3].map((id) => holder({ id, tagNumber: id }));
    const snapshot = baseSnapshot({
      holders,
      events: [
        leagueNight({
          id: 1,
          results: [
            { holderId: 1, rawScoreToPar: -5, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: -2, roundRating: null, tagPresent: true },
            { holderId: 3, rawScoreToPar: 0, roundRating: null, tagPresent: true },
          ],
        }),
      ],
    });

    const result = computeSeason(snapshot);
    for (const h of holders) {
      const sheet = result.scoreSheet[h.id]!;
      const sum = sheet.countedLineItems.reduce((acc, i) => acc + i.points, 0);
      expect(sheet.total).toBe(sum);
    }

    const poolARow = result.championship.A.find((r) => r.holderId === 1);
    expect(poolARow?.totalPoints).toBe(result.scoreSheet[1]!.total);
  });
});

describe("computeSeason — OLP (Spec 02 §2.8)", () => {
  // Worked example 1 (Spec 02 §2.8): 853 rated, +5 avg over 7 rounds, 2
  // Pool-B wins -> 85.3 + 5 - 7 - 2 = 81.3. Built from 7 League Nights
  // against a fixed filler (always 0): the holder beats the filler twice
  // (rank 1, score -3) and loses the other five times (rank 2, score 8),
  // so `poolWins` is exactly 2 and the 7-round average is exactly +5
  // ((2*-3 + 5*8) / 7 = 34/7 -> use -1 for the wins instead so the sum
  // works out to a clean +5 average).
  it("reproduces worked example 1 exactly: 85.3 + 5 - 7 - 2 = 81.3", () => {
    const h = holder({ id: 1, tagNumber: 1, basePool: "B", pdgaMembership: true });
    const filler = holder({ id: 2, tagNumber: 2, basePool: "B", pdgaMembership: true });
    // 2 rounds at -1 (rank 1, beats filler's 0) + 5 rounds at 7.4 (rank 2,
    // loses to filler's 0): sum = 2*-1 + 5*7.4 = -2 + 37 = 35 -> avg 35/7 = 5.
    const scores = [-1, -1, 7.4, 7.4, 7.4, 7.4, 7.4];
    const events: SeasonSnapshotEvent[] = scores.map((s, i) =>
      leagueNight({
        id: i + 1,
        eventDate: `2026-05-${String(i + 1).padStart(2, "0")}`,
        roundOrdinal: i + 1,
        results: [
          { holderId: 1, rawScoreToPar: s, roundRating: null, tagPresent: true },
          { holderId: 2, rawScoreToPar: 0, roundRating: null, tagPresent: true },
        ],
      }),
    );
    const snapshot = baseSnapshot({
      holders: [h, filler],
      ratings: [{ holderId: 1, effectiveDate: "2026-05-01", rating: 853, official: true }],
      subLeagues: [
        { type: "EARLY", startDate: "2026-05-01", endDate: "2026-05-07", complete: false },
        { type: "MID", startDate: "2026-06-15", endDate: "2026-07-15", complete: false },
        { type: "LATE", startDate: "2026-08-01", endDate: "2026-09-01", complete: false },
      ],
      events,
    });

    const result = computeSeason(snapshot);
    const row = result.olp.EARLY.find((r) => r.holderId === 1)!;
    expect(row.rounds).toBe(7);
    expect(row.avgToPar).toBeCloseTo(5, 10);
    expect(row.poolWins).toBe(2);
    expect(row.ratingComponent).toBeCloseTo(85.3, 10);
    expect(roundToOneDecimal(row.score)).toBe(81.3);
  });

  // Worked example 2 (Spec 02 §2.8): 937 rated, -3.3 avg over 6 rounds, 3
  // Pool-A wins -> 93.7 - 3.3 - 6 - 3 = 81.4.
  it("reproduces worked example 2 exactly: 93.7 - 3.3 - 6 - 3 = 81.4", () => {
    const h = holder({ id: 1, tagNumber: 1, basePool: "A", pdgaMembership: true });
    const filler = holder({ id: 2, tagNumber: 2, basePool: "A", pdgaMembership: true });
    // 3 rounds at -10 (rank 1, beats filler's 0) + 3 rounds at 3.4 (rank 2,
    // loses to filler's 0): sum = 3*-10 + 3*3.4 = -30 + 10.2 = -19.8 ->
    // avg -19.8/6 = -3.3.
    const scores = [-10, -10, -10, 3.4, 3.4, 3.4];
    const events: SeasonSnapshotEvent[] = scores.map((s, i) =>
      leagueNight({
        id: i + 1,
        eventDate: `2026-06-${String(i + 15).padStart(2, "0")}`,
        roundOrdinal: i + 1,
        sourceType: "MID",
        results: [
          { holderId: 1, rawScoreToPar: s, roundRating: null, tagPresent: true },
          { holderId: 2, rawScoreToPar: 0, roundRating: null, tagPresent: true },
        ],
      }),
    );
    const snapshot = baseSnapshot({
      holders: [h, filler],
      ratings: [{ holderId: 1, effectiveDate: "2026-06-01", rating: 937, official: true }],
      events,
    });

    const result = computeSeason(snapshot);
    const row = result.olp.MID.find((r) => r.holderId === 1)!;
    expect(row.rounds).toBe(6);
    expect(row.avgToPar).toBeCloseTo(-3.3, 10);
    expect(row.poolWins).toBe(3);
    expect(row.ratingComponent).toBeCloseTo(93.7, 10);
    expect(roundToOneDecimal(row.score)).toBe(81.4);
  });

  it("excludes a canceled round from both the OLP average and round count", () => {
    const h = holder({ id: 1, tagNumber: 1, pdgaMembership: true });
    const snapshot = baseSnapshot({
      holders: [h],
      ratings: [{ holderId: 1, effectiveDate: "2026-05-01", rating: 900, official: true }],
      events: [
        leagueNight({
          id: 1,
          eventDate: "2026-05-01",
          results: [{ holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true }],
        }),
        leagueNight({
          id: 2,
          eventDate: "2026-05-08",
          roundOrdinal: 2,
          canceled: true,
          results: [{ holderId: 1, rawScoreToPar: 999, roundRating: null, tagPresent: true }],
        }),
      ],
    });

    const result = computeSeason(snapshot);
    const row = result.olp.EARLY.find((r) => r.holderId === 1)!;
    expect(row.rounds).toBe(1);
    expect(row.avgToPar).toBe(-10);
  });

  it("marks <4 rounds and missing PDGA membership ineligible, and excludes them from payout", () => {
    const eligible = holder({ id: 1, tagNumber: 1, pdgaMembership: true });
    const tooFewRounds = holder({ id: 2, tagNumber: 2, pdgaMembership: true });
    const noMembership = holder({ id: 3, tagNumber: 3, pdgaMembership: false });

    const nights = (holderIds: number[], count: number, startId: number): SeasonSnapshotEvent[] =>
      Array.from({ length: count }, (_, i) =>
        leagueNight({
          id: startId + i,
          eventDate: `2026-05-${String(i + 1).padStart(2, "0")}`,
          roundOrdinal: i + 1,
          results: holderIds.map((id) => ({
            holderId: id,
            rawScoreToPar: id === 1 ? -10 : 0,
            roundRating: null,
            tagPresent: true,
          })),
        }),
      );

    const events = [
      ...nights([1, 2, 3], 4, 1), // all three play 4 rounds together
    ];
    // Trim holder 2 down to fewer than 4 rounds by removing them from the
    // last two events.
    events[2] = { ...events[2]!, results: events[2]!.results.filter((r) => r.holderId !== 2) };
    events[3] = { ...events[3]!, results: events[3]!.results.filter((r) => r.holderId !== 2) };

    const snapshot = baseSnapshot({
      holders: [eligible, tooFewRounds, noMembership],
      entryCounts: [{ subLeagueType: "EARLY", paidEntries: 10 }],
      events,
    });

    const result = computeSeason(snapshot);
    const rowFor = (id: number) => result.olp.EARLY.find((r) => r.holderId === id)!;

    expect(rowFor(1).eligible).toBe(true);
    expect(rowFor(2).rounds).toBe(2);
    expect(rowFor(2).eligible).toBe(false);
    expect(rowFor(3).eligible).toBe(false);

    // Ineligible holders 2 and 3 still appear but never receive a payout,
    // even though holder 1's dominant score would otherwise leave only
    // two real competitors for 3 payout slots.
    expect(rowFor(2).payout).toBeNull();
    expect(rowFor(3).payout).toBeNull();
    // Only the 1st-place slot has an eligible occupant; the un-awarded
    // 2nd/3rd shares are simply not assigned to anyone (not redistributed
    // to the sole eligible holder) — 50% of the $10 pot.
    expect(rowFor(1).payout).toBe(5);
  });

  it("splits the sub-league's $1-per-entry pot 50/30/20 via largest remainder, projected until complete", () => {
    const holders = [1, 2, 3, 4].map((id) =>
      holder({ id, tagNumber: id, pdgaMembership: true }),
    );
    const events: SeasonSnapshotEvent[] = Array.from({ length: 4 }, (_, i) =>
      leagueNight({
        id: i + 1,
        eventDate: `2026-05-${String(i + 1).padStart(2, "0")}`,
        roundOrdinal: i + 1,
        results: [
          { holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true },
          { holderId: 2, rawScoreToPar: -5, roundRating: null, tagPresent: true },
          { holderId: 3, rawScoreToPar: -1, roundRating: null, tagPresent: true },
          { holderId: 4, rawScoreToPar: 5, roundRating: null, tagPresent: true },
        ],
      }),
    );

    const incomplete = computeSeason(
      baseSnapshot({
        holders,
        events,
        entryCounts: [{ subLeagueType: "EARLY", paidEntries: 101 }],
        subLeagues: [
          { type: "EARLY", startDate: "2026-05-01", endDate: "2026-05-04", complete: false },
          { type: "MID", startDate: "2026-06-15", endDate: "2026-07-15", complete: false },
          { type: "LATE", startDate: "2026-08-01", endDate: "2026-09-01", complete: false },
        ],
      }),
    );
    expect(incomplete.olpPot.EARLY).toBe(101);
    const projectedRows = incomplete.olp.EARLY.filter((r) => r.payout !== null);
    expect(projectedRows).toHaveLength(3);
    expect(projectedRows.every((r) => r.projected)).toBe(true);
    const projectedTotal = projectedRows.reduce((acc, r) => acc + (r.payout ?? 0), 0);
    expect(projectedTotal).toBe(101);
    expect(projectedRows.find((r) => r.rank === 1)?.payout).toBe(51);

    const complete = computeSeason(
      baseSnapshot({
        holders,
        events,
        entryCounts: [{ subLeagueType: "EARLY", paidEntries: 101 }],
        subLeagues: [
          { type: "EARLY", startDate: "2026-05-01", endDate: "2026-05-04", complete: true },
          { type: "MID", startDate: "2026-06-15", endDate: "2026-07-15", complete: false },
          { type: "LATE", startDate: "2026-08-01", endDate: "2026-09-01", complete: false },
        ],
      }),
    );
    const finalRows = complete.olp.EARLY.filter((r) => r.payout !== null);
    expect(finalRows.every((r) => r.projected)).toBe(false);
    expect(finalRows.reduce((acc, r) => acc + (r.payout ?? 0), 0)).toBe(101);
  });
});

describe("computeSeason — skins qualification (Spec 02 §2.9)", () => {
  it("qualifies the top 4 point earners per pool", () => {
    const holders = [1, 2, 3, 4, 5].map((id) => holder({ id, tagNumber: id, basePool: "A" }));
    const events: SeasonSnapshotEvent[] = Array.from({ length: 5 }, (_, i) =>
      leagueNight({
        id: i + 1,
        eventDate: `2026-05-${String(i + 1).padStart(2, "0")}`,
        roundOrdinal: i + 1,
        results: [1, 2, 3, 4, 5].map((id) => ({
          holderId: id,
          rawScoreToPar: id, // lower is better: holder 1 always wins, holder 5 always last
          roundRating: null,
          tagPresent: true,
        })),
      }),
    );
    const snapshot = baseSnapshot({ holders, events });

    const result = computeSeason(snapshot);
    const qualified = result.skins.A.filter((r) => r.qualified).map((r) => r.holderId);
    expect(qualified).toEqual([1, 2, 3, 4]);
    expect(result.skins.A.find((r) => r.holderId === 5)?.qualified).toBe(false);
  });

  it("excludes a Pool B holder rated >920 from skins eligibility, passing the slot to the next available", () => {
    const holders = [
      holder({ id: 1, tagNumber: 1, basePool: "B" }),
      holder({ id: 2, tagNumber: 2, basePool: "B" }),
      holder({ id: 3, tagNumber: 3, basePool: "B" }),
      holder({ id: 4, tagNumber: 4, basePool: "B" }),
      holder({ id: 5, tagNumber: 5, basePool: "B" }),
    ];
    const events: SeasonSnapshotEvent[] = Array.from({ length: 3 }, (_, i) =>
      leagueNight({
        id: i + 1,
        eventDate: `2026-05-${String(i + 1).padStart(2, "0")}`,
        roundOrdinal: i + 1,
        results: [1, 2, 3, 4, 5].map((id) => ({
          holderId: id,
          rawScoreToPar: id, // lower is better: 1st..5th by holder id, holder 1 wins
          roundRating: null,
          tagPresent: true,
        })),
      }),
    );
    const snapshot = baseSnapshot({
      holders,
      events,
      // Holder 1 (rank 1 by points) is rated 925 (>920) -> ineligible for
      // skins; slot passes to holder 5, the next-available point earner.
      ratings: [{ holderId: 1, effectiveDate: "2026-05-01", rating: 925, official: true }],
    });

    const result = computeSeason(snapshot);
    expect(result.skins.B.find((r) => r.holderId === 1)?.eligible).toBe(false);
    expect(result.skins.B.find((r) => r.holderId === 1)?.qualified).toBe(false);
    const qualified = result.skins.B.filter((r) => r.qualified).map((r) => r.holderId);
    expect(qualified).toEqual([2, 3, 4, 5]);
  });
});

describe("computeSeason — financials (Stage H, Spec 09)", () => {
  it("returns coherent financials when financial is present, and zeroed financials when omitted", () => {
    const withFinancial = computeSeason(
      baseSnapshot({
        entryCounts: [{ subLeagueType: "EARLY", paidEntries: 10 }],
        financial: {
          openings: { aceCents: 0, reservesCents: 0 },
          nights: [
            {
              eventId: 1,
              subLeagueType: "EARLY",
              eventDate: "2026-05-01",
              paidEntries: 10,
              aceEntries: 6,
            },
          ],
          tagSales: [],
          payouts: [],
          expenses: [],
          adjustments: [],
        },
      }),
    );

    const sumFunds =
      withFinancial.financials.funds.reserves +
      withFinancial.financials.funds.ace +
      withFinancial.financials.funds.olp.EARLY +
      withFinancial.financials.funds.olp.MID +
      withFinancial.financials.funds.olp.LATE +
      withFinancial.financials.funds.skins.A +
      withFinancial.financials.funds.skins.B;

    expect(sumFunds).toBe(withFinancial.financials.totalCashCents);
    expect(withFinancial.financials.funds.olp.EARLY).toBe(withFinancial.olpPot.EARLY * 100);
    expect(withFinancial.financials.funds.skins.A).toBe(1867);
    expect(withFinancial.financials.funds.skins.B).toBe(933);

    const withoutFinancial = computeSeason(baseSnapshot());
    expect(withoutFinancial.financials.totalCashCents).toBe(0);
    expect(withoutFinancial.financials.ledger).toEqual([]);
    expect(withoutFinancial.financials.totals.paidEntries).toBe(0);
  });
});

describe("computeSeason — tag reassignment timeline integration (Spec 02 §2.10/§2.6)", () => {
  it("publishes tagAssignments and currentTagByHolder for a small multi-night fixture", () => {
    const holders = [
      holder({ id: 1, tagNumber: 1 }),
      holder({ id: 2, tagNumber: 2 }),
    ];
    const snapshot = baseSnapshot({
      holders,
      events: [
        leagueNight({
          id: 1,
          eventDate: "2026-05-01",
          results: [
            { holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: -5, roundRating: null, tagPresent: true },
          ],
        }),
        leagueNight({
          id: 2,
          eventDate: "2026-05-08",
          roundOrdinal: 2,
          results: [
            { holderId: 1, rawScoreToPar: -5, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: -10, roundRating: null, tagPresent: true },
          ],
        }),
      ],
    });

    const result = computeSeason(snapshot);

    // 2 nights x 2 holders = 4 assignment rows, all computed (no overrides).
    expect(result.tagAssignments).toHaveLength(4);
    expect(result.tagAssignments.every((a) => a.source === "computed")).toBe(true);

    // Night 1: holder 1 wins outright, keeps tag 1; holder 2 keeps tag 2
    // (finish order already matches tag order — no swap).
    // Night 2: holder 2 wins outright, so the combined-field reassignment
    // now hands holder 2 the lower tag (1) and holder 1 tag 2.
    expect(result.currentTagByHolder[1]).toBe(2);
    expect(result.currentTagByHolder[2]).toBe(1);

    const night2Holder2 = result.tagAssignments.find((a) => a.eventId === 2 && a.holderId === 2)!;
    expect(night2Holder2.tagIn).toBe(2);
    expect(night2Holder2.tagOut).toBe(1);
  });

  it("breaks a League-Night tie by the tag-in from a prior night's reshuffle, not the static roster tag", () => {
    // Night 1: holder 2 (initial tag 2) beats holder 1 (initial tag 1)
    // outright, so the reassignment swaps their tags: holder 1 -> tag 2,
    // holder 2 -> tag 1.
    const holders = [
      holder({ id: 1, tagNumber: 1 }),
      holder({ id: 2, tagNumber: 2 }),
    ];
    const snapshot = baseSnapshot({
      holders,
      events: [
        leagueNight({
          id: 1,
          eventDate: "2026-05-01",
          results: [
            { holderId: 1, rawScoreToPar: -5, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: -10, roundRating: null, tagPresent: true },
          ],
        }),
        // Night 2: tied score. Under the OLD static-tag tie-break, holder
        // 1 (roster tag 1) would win. Under the correct as-of tag-in
        // tie-break, holder 2 (now holding tag 1 after night 1) wins.
        leagueNight({
          id: 2,
          eventDate: "2026-05-08",
          roundOrdinal: 2,
          results: [
            { holderId: 1, rawScoreToPar: -3, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: -3, roundRating: null, tagPresent: true },
          ],
        }),
      ],
    });

    const result = computeSeason(snapshot);
    const items1 = result.scoreSheet[1]!.countedLineItems.find((i) => i.eventId === 2)!;
    const items2 = result.scoreSheet[2]!.countedLineItems.find((i) => i.eventId === 2)!;

    expect(items2.rank).toBe(1);
    expect(items2.points).toBe(100);
    expect(items2.tieBrokenByTag).toBe(true);
    expect(items1.rank).toBe(2);
    expect(items1.points).toBe(60);
    expect(items1.tieBrokenByTag).toBe(true);
  });
});
