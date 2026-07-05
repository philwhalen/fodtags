// Pure unit tests for the score-sheet view projection (Spec 07 §7.2/§7.3;
// plans/score-sheets/01-pure-helpers.md).
import { describe, expect, it } from "vitest";

import {
  buildScoreSheetLinks,
  capLabel,
  filterScoreSheetHolders,
  projectScoreSheet,
} from "./score-sheet-view";
import type {
  PublicScoreSheetHolder,
  PublicScoreSheetPayload,
  ScoreSheetCaps,
  ScoreSheetViewLine,
} from "./score-sheet-view";

function line(
  overrides: Partial<ScoreSheetViewLine> & Pick<ScoreSheetViewLine, "eventId" | "type">,
): ScoreSheetViewLine {
  return {
    date: "2026-05-01",
    label: "Early League Night",
    roundOrdinal: null,
    pool: "A",
    rank: 1,
    points: 10,
    tieBrokenByTag: false,
    ...overrides,
  };
}

const caps2: ScoreSheetCaps = {
  leagueNight: 15,
  tournament: 2,
  tournamentSourceCount: 3,
  fodOpen: 1,
};

const caps3: ScoreSheetCaps = {
  leagueNight: 15,
  tournament: 3,
  tournamentSourceCount: 4,
  fodOpen: 1,
};

function holder(
  overrides: Partial<PublicScoreSheetHolder> & Pick<PublicScoreSheetHolder, "holderId" | "tagNumber">,
): PublicScoreSheetHolder {
  return {
    name: `Holder ${overrides.holderId}`,
    slug: `holder-${overrides.holderId}`,
    rank: 1,
    tieBrokenByTag: false,
    byType: { LeagueNight: 0, Podium: 0, Tournament: 0, FODOpen: 0 },
    total: 0,
    counted: [],
    dropped: [],
    projectedPodium: [],
    ...overrides,
  };
}

function payload(
  holders: PublicScoreSheetHolder[],
  overrides: Partial<PublicScoreSheetPayload> = {},
): PublicScoreSheetPayload {
  return {
    pool: "A",
    holders,
    caps: caps2,
    updatedAt: "2026-06-01T00:00:00.000Z",
    stale: false,
    pendingReview: 0,
    ...overrides,
  };
}

describe("projectScoreSheet — reconciliation", () => {
  it("sums counted points to holder.total and to byType per event type", () => {
    const h = holder({
      holderId: 1,
      tagNumber: 5,
      total: 26,
      byType: { LeagueNight: 18, Podium: 3, Tournament: 5, FODOpen: 0 },
      counted: [
        line({ eventId: 101, type: "LeagueNight", points: 10, date: "2026-05-01", roundOrdinal: 1 }),
        line({ eventId: 102, type: "LeagueNight", points: 8, date: "2026-05-08", roundOrdinal: 2 }),
        line({ eventId: 201, type: "Tournament", points: 5, date: "2026-06-01", label: "Spring Open" }),
        line({ eventId: -1, type: "Podium", points: 3, date: "2026-05-15", subLeague: "EARLY" }),
      ],
    });
    const projection = projectScoreSheet(payload([h]));
    const view = projection.holders[0]!;
    const countedSum = view.groups.reduce(
      (sum, g) => sum + g.counted.reduce((s, l) => s + l.points, 0),
      0,
    );
    expect(countedSum).toBe(h.total);
    for (const type of ["LeagueNight", "Podium", "Tournament", "FODOpen"] as const) {
      const group = view.groups.find((g) => g.type === type)!;
      const sum = group.counted.reduce((s, l) => s + l.points, 0);
      expect(sum).toBe(h.byType[type]);
    }
  });
});

describe("projectScoreSheet — projected Podium excluded", () => {
  it("shows a projected Podium line as a flagged dropped-style entry, excluded from totals", () => {
    const h = holder({
      holderId: 2,
      tagNumber: 6,
      total: 10,
      byType: { LeagueNight: 10, Podium: 0, Tournament: 0, FODOpen: 0 },
      counted: [line({ eventId: 301, type: "LeagueNight", points: 10, date: "2026-05-01" })],
      projectedPodium: [
        line({ eventId: -1, type: "Podium", points: 3, date: "2026-06-01", subLeague: "MID" }),
      ],
    });
    const projection = projectScoreSheet(payload([h]));
    const podiumGroup = projection.holders[0]!.groups.find((g) => g.type === "Podium")!;
    expect(podiumGroup.counted).toEqual([]);
    expect(podiumGroup.dropped).toHaveLength(1);
    const projectedLine = podiumGroup.dropped[0]!;
    expect(projectedLine.projected).toBe(true);
    expect(projectedLine.reason).toBe("projected — not final");
    expect(projectedLine.title).toBe("Mid Podium");

    const countedSum = projection.holders[0]!.groups.reduce(
      (sum, g) => sum + g.counted.reduce((s, l) => s + l.points, 0),
      0,
    );
    expect(countedSum).toBe(h.total);
  });
});

describe("projectScoreSheet — dropped reasons", () => {
  it("labels cap drops with the type's cap text (best 15 / best 2)", () => {
    const h = holder({
      holderId: 3,
      tagNumber: 7,
      dropped: [
        line({ eventId: 401, type: "LeagueNight", date: "2026-05-20", droppedReason: "cap" }),
        line({ eventId: 402, type: "Tournament", date: "2026-06-10", droppedReason: "cap" }),
      ],
    });
    const projection = projectScoreSheet(payload([h], { caps: caps2 }));
    const holderView = projection.holders[0]!;
    const lnDropped = holderView.groups.find((g) => g.type === "LeagueNight")!.dropped[0]!;
    const tDropped = holderView.groups.find((g) => g.type === "Tournament")!.dropped[0]!;
    expect(lnDropped.reason).toBe("beyond best 15");
    expect(tDropped.reason).toBe("beyond best 2");
  });

  it("uses the payload's tournament cap (best 3) once the season has 4+ tournaments", () => {
    const h = holder({
      holderId: 4,
      tagNumber: 8,
      dropped: [line({ eventId: 501, type: "Tournament", date: "2026-06-15", droppedReason: "cap" })],
    });
    const projection = projectScoreSheet(payload([h], { caps: caps3 }));
    const tDropped = projection.holders[0]!.groups.find((g) => g.type === "Tournament")!.dropped[0]!;
    expect(tDropped.reason).toBe("beyond best 3");
  });

  it("labels a forfeited item as forfeited regardless of type", () => {
    const h = holder({
      holderId: 5,
      tagNumber: 9,
      dropped: [
        line({ eventId: 601, type: "LeagueNight", date: "2026-04-01", pool: "B", droppedReason: "forfeited" }),
      ],
    });
    const projection = projectScoreSheet(payload([h]));
    const dropped = projection.holders[0]!.groups.find((g) => g.type === "LeagueNight")!.dropped[0]!;
    expect(dropped.reason).toBe("forfeited on pool switch");
  });
});

describe("projectScoreSheet — label composition", () => {
  it("composes League Night titles with the round ordinal when present", () => {
    const h = holder({
      holderId: 6,
      tagNumber: 10,
      counted: [
        line({ eventId: 701, type: "LeagueNight", label: "Early League Night", date: "2026-05-01", roundOrdinal: 3 }),
      ],
    });
    const projection = projectScoreSheet(payload([h]));
    const title = projection.holders[0]!.groups.find((g) => g.type === "LeagueNight")!.counted[0]!.title;
    expect(title).toBe("Early League Night Round 3 · 2026-05-01");
  });

  it("falls back to 'label · date' when the round ordinal is null", () => {
    const h = holder({
      holderId: 7,
      tagNumber: 11,
      counted: [
        line({ eventId: 702, type: "LeagueNight", label: "Early League Night", date: "2026-05-08", roundOrdinal: null }),
      ],
    });
    const projection = projectScoreSheet(payload([h]));
    const title = projection.holders[0]!.groups.find((g) => g.type === "LeagueNight")!.counted[0]!.title;
    expect(title).toBe("Early League Night · 2026-05-08");
  });

  it("labels a counted Podium line by sub-league name only", () => {
    const h = holder({
      holderId: 8,
      tagNumber: 12,
      total: 5,
      byType: { LeagueNight: 0, Podium: 5, Tournament: 0, FODOpen: 0 },
      counted: [
        line({ eventId: -1, type: "Podium", label: "", date: "2026-06-01", subLeague: "MID", points: 5 }),
      ],
    });
    const projection = projectScoreSheet(payload([h]));
    const title = projection.holders[0]!.groups.find((g) => g.type === "Podium")!.counted[0]!.title;
    expect(title).toBe("Mid Podium");
  });

  it("composes Tournament/FOD Open titles as 'label · date'", () => {
    const h = holder({
      holderId: 9,
      tagNumber: 13,
      counted: [
        line({ eventId: 801, type: "Tournament", label: "Spring Open", date: "2026-06-01" }),
        line({ eventId: 802, type: "FODOpen", label: "FOD Open", date: "2026-08-01" }),
      ],
    });
    const projection = projectScoreSheet(payload([h]));
    const tTitle = projection.holders[0]!.groups.find((g) => g.type === "Tournament")!.counted[0]!.title;
    const fTitle = projection.holders[0]!.groups.find((g) => g.type === "FODOpen")!.counted[0]!.title;
    expect(tTitle).toBe("Spring Open · 2026-06-01");
    expect(fTitle).toBe("FOD Open · 2026-08-01");
  });
});

describe("projectScoreSheet — finish ordinals", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [21, "21st"],
  ])("formats rank %i as %s with the pool suffix", (rank, expected) => {
    const h = holder({
      holderId: 100 + rank,
      tagNumber: rank,
      counted: [line({ eventId: 900 + rank, type: "LeagueNight", rank, pool: "B" })],
    });
    const projection = projectScoreSheet(payload([h]));
    const finish = projection.holders[0]!.groups.find((g) => g.type === "LeagueNight")!.counted[0]!.finish;
    expect(finish).toBe(`${expected} (Pool B)`);
  });
});

describe("projectScoreSheet — group order & within-group sort", () => {
  it("always emits groups in LeagueNight, Podium, Tournament, FODOpen order regardless of input order", () => {
    const h = holder({
      holderId: 20,
      tagNumber: 20,
      counted: [
        line({ eventId: 1, type: "FODOpen", date: "2026-08-01" }),
        line({ eventId: 2, type: "Tournament", date: "2026-06-01" }),
        line({ eventId: -1, type: "Podium", date: "2026-05-15", subLeague: "EARLY" }),
        line({ eventId: 4, type: "LeagueNight", date: "2026-05-01" }),
      ],
    });
    const projection = projectScoreSheet(payload([h]));
    expect(projection.holders[0]!.groups.map((g) => g.type)).toEqual([
      "LeagueNight",
      "Podium",
      "Tournament",
      "FODOpen",
    ]);
  });

  it("sorts League Night lines by date ascending regardless of input order", () => {
    const h = holder({
      holderId: 21,
      tagNumber: 21,
      counted: [
        line({ eventId: 11, type: "LeagueNight", date: "2026-05-15" }),
        line({ eventId: 12, type: "LeagueNight", date: "2026-05-01" }),
        line({ eventId: 13, type: "LeagueNight", date: "2026-05-08" }),
      ],
    });
    const projection = projectScoreSheet(payload([h]));
    const titles = projection.holders[0]!.groups
      .find((g) => g.type === "LeagueNight")!
      .counted.map((l) => l.title);
    expect(titles).toEqual([
      expect.stringContaining("2026-05-01"),
      expect.stringContaining("2026-05-08"),
      expect.stringContaining("2026-05-15"),
    ]);
  });

  it("sorts Podium lines by sub-league order (Early, Mid, Late) rather than date", () => {
    const h = holder({
      holderId: 22,
      tagNumber: 22,
      counted: [
        line({ eventId: -1, type: "Podium", date: "2026-09-01", subLeague: "LATE" }),
        line({ eventId: -1, type: "Podium", date: "2026-05-01", subLeague: "EARLY" }),
        line({ eventId: -1, type: "Podium", date: "2026-07-01", subLeague: "MID" }),
      ],
    });
    const projection = projectScoreSheet(payload([h]));
    const titles = projection.holders[0]!.groups
      .find((g) => g.type === "Podium")!
      .counted.map((l) => l.title);
    expect(titles).toEqual(["Early Podium", "Mid Podium", "Late Podium"]);
  });
});

describe("capLabel", () => {
  it("returns the fixed heading text for each type, incl. the dynamic tournament cap", () => {
    expect(capLabel("LeagueNight", caps2)).toBe("League Nights (best 15)");
    expect(capLabel("Podium", caps2)).toBe("League Podium");
    expect(capLabel("Tournament", caps2)).toBe("Tournaments (best 2 of 3)");
    expect(capLabel("FODOpen", caps2)).toBe("FOD Open");
    expect(capLabel("Tournament", caps3)).toBe("Tournaments (best 3 of 4)");
  });
});

describe("buildScoreSheetLinks", () => {
  it("returns the two /{season}/score-sheet/{slug} hrefs", () => {
    expect(buildScoreSheetLinks("2026")).toEqual({
      "pool-a": "/2026/score-sheet/pool-a",
      "pool-b": "/2026/score-sheet/pool-b",
    });
  });
});

describe("filterScoreSheetHolders", () => {
  it("narrows by name, preserves order, and is the identity for an empty query", () => {
    const holders = [
      holder({ holderId: 1, tagNumber: 1, name: "Alice Adams" }),
      holder({ holderId: 2, tagNumber: 2, name: "Bob Baker" }),
      holder({ holderId: 3, tagNumber: 3, name: "Alicia Chen" }),
    ];
    expect(filterScoreSheetHolders(holders, "ali").map((h) => h.holderId)).toEqual([1, 3]);
    expect(filterScoreSheetHolders(holders, "")).toEqual(holders);
  });
});
