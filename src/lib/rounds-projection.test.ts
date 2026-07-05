// Pure unit tests for Rounds roster projection helpers (Spec 05 §5.2/§5.5).
import { describe, expect, it } from "vitest";

import {
  filterHolderRounds,
  filterRosterByName,
  roundTrendSeries,
  summarizeRoster,
} from "./rounds-projection";
import type { RoundRow, RoundsHolderEntry, RosterRow } from "./rounds-types";

function round(overrides: Partial<RoundRow> & Pick<RoundRow, "eventId">): RoundRow {
  return {
    date: "2026-03-01",
    type: "LeagueNight",
    subLeague: "EARLY",
    eventLabel: "LN1",
    roundOrdinal: 1,
    scoreToPar: 2,
    roundRating: 980,
    ...overrides,
  };
}

const sampleRounds: RoundRow[] = [
  round({ eventId: 1, date: "2026-03-01", subLeague: "EARLY", roundOrdinal: 1, roundRating: 980 }),
  round({ eventId: 2, date: "2026-03-08", subLeague: "EARLY", roundOrdinal: 2, roundRating: null }),
  round({ eventId: 3, date: "2026-03-15", subLeague: "MID", roundOrdinal: 1, roundRating: 990 }),
  round({
    eventId: 4,
    date: "2026-04-01",
    type: "Tournament",
    subLeague: null,
    roundOrdinal: null,
    roundRating: 1000,
  }),
  round({
    eventId: 5,
    date: "2026-04-10",
    type: "FODOpen",
    subLeague: null,
    roundOrdinal: null,
    roundRating: 1010,
  }),
];

describe("filterHolderRounds", () => {
  it("under a sub-league filter keeps only that league's League Nights", () => {
    const result = filterHolderRounds(sampleRounds, { league: "early", types: ["ln"] });
    expect(result.map((r) => r.eventId)).toEqual([2, 1]);
  });

  it("excludes Tournament and FOD Open under a sub-league filter", () => {
    const result = filterHolderRounds(sampleRounds, { league: "mid", types: ["ln"] });
    expect(result.map((r) => r.eventId)).toEqual([3]);
  });

  it("All + ln only keeps League Nights across sub-leagues", () => {
    const result = filterHolderRounds(sampleRounds, { league: null, types: ["ln"] });
    expect(result.map((r) => r.eventId)).toEqual([3, 2, 1]);
  });

  it("All + types combo includes selected event types", () => {
    const result = filterHolderRounds(sampleRounds, {
      league: null,
      types: ["ln", "tournament"],
    });
    expect(result.map((r) => r.eventId)).toEqual([4, 3, 2, 1]);
  });

  it("sorts newest-first by date, then roundOrdinal desc with nulls last", () => {
    const rounds: RoundRow[] = [
      round({ eventId: 10, date: "2026-05-01", roundOrdinal: 1 }),
      round({ eventId: 11, date: "2026-05-01", roundOrdinal: 3 }),
      round({ eventId: 12, date: "2026-05-01", roundOrdinal: null }),
      round({ eventId: 13, date: "2026-05-01", roundOrdinal: 2 }),
    ];
    const result = filterHolderRounds(rounds, { league: null, types: ["ln"] });
    expect(result.map((r) => r.eventId)).toEqual([11, 13, 10, 12]);
  });
});

describe("roundTrendSeries", () => {
  it("returns rated values in chronological order", () => {
    const filtered = filterHolderRounds(sampleRounds, { league: null, types: ["ln"] });
    expect(roundTrendSeries(filtered)).toEqual([980, 990]);
  });

  it("ignores null (pending) ratings", () => {
    const rounds = [
      round({ eventId: 1, date: "2026-01-01", roundRating: 950 }),
      round({ eventId: 2, date: "2026-01-08", roundRating: null }),
      round({ eventId: 3, date: "2026-01-15", roundRating: 960 }),
    ];
    expect(roundTrendSeries(rounds)).toEqual([950, 960]);
  });

  it("returns empty when fewer than two rated rounds", () => {
    expect(roundTrendSeries([round({ eventId: 1, roundRating: 980 })])).toEqual([]);
    expect(roundTrendSeries([])).toEqual([]);
  });
});

describe("summarizeRoster", () => {
  const holders: RoundsHolderEntry[] = [
    {
      holderId: 1,
      name: "Alice",
      slug: "alice",
      tagNumber: 5,
      presentRating: 980,
      rounds: sampleRounds,
    },
    {
      holderId: 2,
      name: "Bob",
      slug: "bob",
      tagNumber: 2,
      presentRating: 1010,
      rounds: [],
    },
    {
      holderId: 3,
      name: "Carol",
      slug: "carol",
      tagNumber: 8,
      presentRating: null,
      rounds: sampleRounds.slice(0, 1),
    },
    {
      holderId: 4,
      name: "Dan",
      slug: "dan",
      tagNumber: 1,
      presentRating: 1010,
      rounds: sampleRounds.slice(0, 1),
    },
  ];

  it("orders by present rating desc with unrated last and tag-number tie-break", () => {
    const result = summarizeRoster(holders, { league: null, types: ["ln"] });
    expect(result.map((r) => r.holderId)).toEqual([4, 2, 1, 3]);
  });

  it("includes zero-round holders", () => {
    const result = summarizeRoster(holders, { league: null, types: ["ln"] });
    const bob = result.find((r) => r.holderId === 2);
    expect(bob).toMatchObject({ roundCount: 0, trend: [] });
  });

  it("roundCount and trend reflect the active filter", () => {
    const result = summarizeRoster(holders, { league: "early", types: ["ln"] });
    const alice = result.find((r) => r.holderId === 1);
    expect(alice?.roundCount).toBe(2);
    expect(alice?.trend).toEqual([]);
  });
});

describe("filterRosterByName", () => {
  const rows: RosterRow[] = [
    {
      holderId: 1,
      name: "John Doe",
      slug: "john-doe",
      tagNumber: 1,
      presentRating: 980,
      roundCount: 3,
      trend: [970, 980],
    },
    {
      holderId: 2,
      name: "José Ramirez",
      slug: "jose-ramirez",
      tagNumber: 2,
      presentRating: 990,
      roundCount: 2,
      trend: [985, 990],
    },
  ];

  it("empty query returns rows unchanged", () => {
    expect(filterRosterByName(rows, "")).toBe(rows);
  });

  it("matches case-insensitively via normalizeName", () => {
    expect(filterRosterByName(rows, "jose").map((r) => r.name)).toEqual(["José Ramirez"]);
  });
});
