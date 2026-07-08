// Priority test (CLAUDE.md "Testing priorities"; Spec 02 §2.10 acceptance
// criteria): `computeTagTimeline` is pure — plain fixture in, plain
// fixture out — reproducing the nightly combined-field tag reassignment
// by hand calculation, exactly like the OLP worked examples.
import { describe, expect, it } from "vitest";

import { computeTagTimeline } from "@server/engine/tags";
import type {
  SeasonSnapshotEvent,
  SeasonSnapshotHolder,
  SeasonSnapshotTagOverride,
} from "@/lib";

function holder(id: number, tagNumber: number | null): Pick<SeasonSnapshotHolder, "id" | "tagNumber"> {
  return { id, tagNumber };
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

describe("computeTagTimeline — basic reassignment", () => {
  it("hands out tags lowest-score-takes-lowest-tag across a combined field", () => {
    const timeline = computeTagTimeline({
      holders: [holder(1, 1), holder(2, 2), holder(3, 3)],
      events: [
        leagueNight({
          id: 100,
          results: [
            // Holder 3 (tag 3) scores best, holder 1 (tag 1) worst.
            { holderId: 1, rawScoreToPar: 5, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: 0, roundRating: null, tagPresent: true },
            { holderId: 3, rawScoreToPar: -5, roundRating: null, tagPresent: true },
          ],
        }),
      ],
      tagOverrides: [],
    });

    // Pile = {1, 2, 3}. Rank order (best score first): 3, 2, 1.
    // 3 takes tag 1, 2 takes tag 2, 1 takes tag 3.
    expect(timeline.tagAsOf(3, "2026-05-01")).toBe(1);
    expect(timeline.tagAsOf(2, "2026-05-01")).toBe(2);
    expect(timeline.tagAsOf(1, "2026-05-01")).toBe(3);

    expect(timeline.currentTagByHolder.get(1)).toBe(3);
    expect(timeline.currentTagByHolder.get(2)).toBe(2);
    expect(timeline.currentTagByHolder.get(3)).toBe(1);

    const row3 = timeline.assignments.find((a) => a.holderId === 3);
    expect(row3).toEqual({ eventId: 100, holderId: 3, tagIn: 3, tagOut: 1, source: "computed" });
  });
});

describe("computeTagTimeline — score tie broken by tag-in", () => {
  it("gives the lower tag-in the lower tag-out on a tied score", () => {
    const timeline = computeTagTimeline({
      holders: [holder(1, 5), holder(2, 1)],
      events: [
        leagueNight({
          id: 100,
          results: [
            { holderId: 1, rawScoreToPar: 0, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: 0, roundRating: null, tagPresent: true },
          ],
        }),
      ],
      tagOverrides: [],
    });

    // Tied score; holder 2's tag-in (1) is lower than holder 1's (5), so
    // holder 2 wins the tie and takes the lower tag-out.
    expect(timeline.tagInForNight(2, 100)).toBe(1);
    expect(timeline.currentTagByHolder.get(2)).toBe(1);
    expect(timeline.currentTagByHolder.get(1)).toBe(5);
  });
});

describe("computeTagTimeline — combined pool", () => {
  it("lets a Pool B holder outscoring a Pool A holder take the lower tag", () => {
    // The pool of the holder is irrelevant to this module — it only sees
    // holder id / tag / score, so a "Pool B holder" here is simply a
    // holder with a worse initial tag who out-scores a lower-tag holder.
    const timeline = computeTagTimeline({
      holders: [holder(1, 1), holder(2, 9)],
      events: [
        leagueNight({
          id: 100,
          results: [
            { holderId: 1, rawScoreToPar: 3, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: -3, roundRating: null, tagPresent: true },
          ],
        }),
      ],
      tagOverrides: [],
    });

    expect(timeline.currentTagByHolder.get(2)).toBe(1);
    expect(timeline.currentTagByHolder.get(1)).toBe(9);
  });
});

describe("computeTagTimeline — cancelled night", () => {
  it("performs no reassignment and produces no assignments", () => {
    const timeline = computeTagTimeline({
      holders: [holder(1, 1), holder(2, 2)],
      events: [
        leagueNight({
          id: 100,
          canceled: true,
          results: [
            { holderId: 1, rawScoreToPar: 5, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: -5, roundRating: null, tagPresent: true },
          ],
        }),
      ],
      tagOverrides: [],
    });

    expect(timeline.assignments).toEqual([]);
    expect(timeline.currentTagByHolder.get(1)).toBe(1);
    expect(timeline.currentTagByHolder.get(2)).toBe(2);
  });
});

describe("computeTagTimeline — absent holder", () => {
  it("keeps an absent holder's tag unchanged while others reshuffle among themselves", () => {
    const timeline = computeTagTimeline({
      holders: [holder(1, 1), holder(2, 2), holder(3, 3)],
      events: [
        leagueNight({
          id: 100,
          // Holder 3 has no result this night — absent.
          results: [
            { holderId: 1, rawScoreToPar: 5, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: -5, roundRating: null, tagPresent: true },
          ],
        }),
      ],
      tagOverrides: [],
    });

    // Only tags 1 and 2 are in the pile; holder 3's tag 3 is untouched.
    expect(timeline.currentTagByHolder.get(3)).toBe(3);
    expect(timeline.currentTagByHolder.get(2)).toBe(1);
    expect(timeline.currentTagByHolder.get(1)).toBe(2);
    expect(timeline.assignments).toHaveLength(2);
  });
});

describe("computeTagTimeline — tagPresent = false", () => {
  it("excludes a holder whose tag was not physically present from the pile", () => {
    const timeline = computeTagTimeline({
      holders: [holder(1, 1), holder(2, 2)],
      events: [
        leagueNight({
          id: 100,
          results: [
            { holderId: 1, rawScoreToPar: 5, roundRating: null, tagPresent: false },
            { holderId: 2, rawScoreToPar: -5, roundRating: null, tagPresent: true },
          ],
        }),
      ],
      tagOverrides: [],
    });

    // Holder 1 didn't return their tag, so the pile only has holder 2's
    // tag; holder 2 keeps their own tag (only entrant in the pile).
    expect(timeline.currentTagByHolder.get(1)).toBe(1);
    expect(timeline.currentTagByHolder.get(2)).toBe(2);
    expect(timeline.assignments).toHaveLength(1);
    expect(timeline.assignments[0]?.holderId).toBe(2);
  });
});

describe("computeTagTimeline — provisional holder with no initial tag", () => {
  it("is excluded until assigned via an override, then participates going forward", () => {
    const timeline = computeTagTimeline({
      holders: [holder(1, 1), holder(2, 2), holder(9, null)],
      events: [
        leagueNight({
          id: 100,
          eventDate: "2026-05-01",
          // Provisional holder 9 has no tag yet and is excluded from the
          // computed pile even though they played.
          results: [
            { holderId: 1, rawScoreToPar: 0, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: 5, roundRating: null, tagPresent: true },
            { holderId: 9, rawScoreToPar: -10, roundRating: null, tagPresent: true },
          ],
        }),
        leagueNight({
          id: 101,
          eventDate: "2026-05-08",
          // A director assigns holder 9 a physical tag (10) this night via
          // override — holder 9 still isn't a computed participant (no
          // current tag going in), but the override seeds one.
          results: [
            { holderId: 1, rawScoreToPar: 0, roundRating: null, tagPresent: true },
            { holderId: 9, rawScoreToPar: 0, roundRating: null, tagPresent: true },
          ],
        }),
        leagueNight({
          id: 102,
          eventDate: "2026-05-15",
          // Now holder 9 has a current tag (10) and fully participates.
          results: [
            { holderId: 1, rawScoreToPar: 5, roundRating: null, tagPresent: true },
            { holderId: 9, rawScoreToPar: -5, roundRating: null, tagPresent: true },
          ],
        }),
      ],
      tagOverrides: [{ eventId: 101, holderId: 9, tagOut: 10 }],
    });

    // Night 100: holder 9 not in the pile despite the best score.
    expect(timeline.assignments.filter((a) => a.eventId === 100).map((a) => a.holderId)).toEqual([
      1, 2,
    ]);
    expect(timeline.tagInForNight(9, 100)).toBeNull();

    // Night 101: override inserts holder 9 with tagIn null, tagOut 10,
    // source "override"; holder 1 (the only computed participant) is
    // untouched by the override and keeps their own tag.
    const night101for9 = timeline.assignments.find((a) => a.eventId === 101 && a.holderId === 9);
    expect(night101for9).toEqual({
      eventId: 101,
      holderId: 9,
      tagIn: null,
      tagOut: 10,
      source: "override",
    });
    expect(night101for9?.tagOut).toBe(10);

    // Night 102: holder 9 now enters the computed combined-field pile with
    // tag-in 10 and, out-scoring holder 1 (tag-in 1), takes the lower tag.
    expect(timeline.tagInForNight(9, 102)).toBe(10);
    const bestScorer = timeline.assignments.find((a) => a.eventId === 102 && a.holderId === 9);
    expect(bestScorer?.source).toBe("computed");
    expect(bestScorer?.tagOut).toBe(1);
    expect(timeline.currentTagByHolder.get(9)).toBe(1);
    expect(timeline.currentTagByHolder.get(1)).toBe(10);
  });
});

describe("computeTagTimeline — override flowing forward", () => {
  it("applies a non-computed (but still-permutation) override and carries it to the next night's tag-in", () => {
    const timeline = computeTagTimeline({
      holders: [holder(1, 1), holder(2, 2)],
      events: [
        leagueNight({
          id: 100,
          eventDate: "2026-05-01",
          results: [
            { holderId: 1, rawScoreToPar: -5, roundRating: null, tagPresent: true }, // would win tag 1
            { holderId: 2, rawScoreToPar: 5, roundRating: null, tagPresent: true },
          ],
        }),
        leagueNight({
          id: 101,
          eventDate: "2026-05-08",
          results: [
            { holderId: 1, rawScoreToPar: 0, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: 0, roundRating: null, tagPresent: true },
          ],
        }),
      ],
      // Override the computed outcome (1 -> tag 1, 2 -> tag 2) to the
      // opposite, still-valid permutation.
      tagOverrides: [
        { eventId: 100, holderId: 1, tagOut: 2 },
        { eventId: 100, holderId: 2, tagOut: 1 },
      ],
    });

    const row1 = timeline.assignments.find((a) => a.eventId === 100 && a.holderId === 1);
    expect(row1).toEqual({ eventId: 100, holderId: 1, tagIn: 1, tagOut: 2, source: "override" });

    // Flows forward: night 101's tag-ins reflect the override, not the
    // computed value.
    expect(timeline.tagInForNight(1, 101)).toBe(2);
    expect(timeline.tagInForNight(2, 101)).toBe(1);
  });
});

describe("computeTagTimeline — mid-season buy-in", () => {
  it("enters a holder with a newly issued highest tag from their first participating night", () => {
    // Holder 3 buys a brand-new tag (99, never issued before) mid-season:
    // modeled as present in the input from the start (their initial tag
    // is fixed at buy-in) but absent from every event's results until
    // their first participating night (Spec 02 §2.10 "mid-season buy-in").
    const timelineWithBuyIn = computeTagTimeline({
      holders: [holder(1, 1), holder(2, 2), holder(3, 99)],
      events: [
        leagueNight({
          id: 100,
          eventDate: "2026-05-01",
          results: [{ holderId: 1, rawScoreToPar: 0, roundRating: null, tagPresent: true }],
        }),
        leagueNight({
          id: 101,
          eventDate: "2026-05-08",
          results: [
            { holderId: 1, rawScoreToPar: 5, roundRating: null, tagPresent: true },
            { holderId: 3, rawScoreToPar: -5, roundRating: null, tagPresent: true },
          ],
        }),
      ],
      tagOverrides: [],
    });

    // Night 100: holder 3 has no result yet, so no row and their tag (99)
    // is untouched.
    expect(timelineWithBuyIn.tagInForNight(3, 100)).toBeNull();
    expect(timelineWithBuyIn.assignments.filter((a) => a.eventId === 100 && a.holderId === 3)).toHaveLength(
      0,
    );

    // Night 101: holder 3 enters the pile with tag-in 99 and, out-scoring
    // holder 1 (tag-in 1), takes the lower tag.
    expect(timelineWithBuyIn.tagInForNight(3, 101)).toBe(99);
    expect(timelineWithBuyIn.currentTagByHolder.get(3)).toBe(1);
    expect(timelineWithBuyIn.currentTagByHolder.get(1)).toBe(99);
  });
});

describe("computeTagTimeline — multi-night same date", () => {
  it("orders same-date nights by roundOrdinal and carries the sequence through both", () => {
    const timeline = computeTagTimeline({
      holders: [holder(1, 1), holder(2, 2)],
      events: [
        leagueNight({
          id: 200,
          eventDate: "2026-05-01",
          roundOrdinal: 2,
          results: [
            { holderId: 1, rawScoreToPar: -5, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: 5, roundRating: null, tagPresent: true },
          ],
        }),
        leagueNight({
          id: 100,
          eventDate: "2026-05-01",
          roundOrdinal: 1,
          results: [
            { holderId: 1, rawScoreToPar: 5, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: -5, roundRating: null, tagPresent: true },
          ],
        }),
      ],
      tagOverrides: [],
    });

    // Despite array/id order, round 1 (eventId 100) must process before
    // round 2 (eventId 200): round 1 flips 1<->2 tags, so round 2's
    // tag-ins reflect round 1's outcome.
    expect(timeline.tagInForNight(1, 100)).toBe(1);
    expect(timeline.tagInForNight(2, 100)).toBe(2);
    // After round 1: holder 2 (better score) takes tag 1, holder 1 takes tag 2.
    expect(timeline.tagInForNight(1, 200)).toBe(2);
    expect(timeline.tagInForNight(2, 200)).toBe(1);
    // Round 2: holder 1 (tag-in 2) has the better score, takes tag 1 (the
    // lower of {1, 2}); holder 2 takes tag 2.
    expect(timeline.currentTagByHolder.get(1)).toBe(1);
    expect(timeline.currentTagByHolder.get(2)).toBe(2);
  });
});

describe("computeTagTimeline — tagAsOf boundaries", () => {
  it("returns the initial tag before any night, and the correct tag-out on/after each night", () => {
    const timeline = computeTagTimeline({
      holders: [holder(1, 1), holder(2, 2)],
      events: [
        leagueNight({
          id: 100,
          eventDate: "2026-05-01",
          results: [
            { holderId: 1, rawScoreToPar: 5, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: -5, roundRating: null, tagPresent: true },
          ],
        }),
        leagueNight({
          id: 101,
          eventDate: "2026-06-01",
          results: [
            { holderId: 1, rawScoreToPar: -5, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: 5, roundRating: null, tagPresent: true },
          ],
        }),
      ],
      tagOverrides: [],
    });

    // Before the first night: initial tags.
    expect(timeline.tagAsOf(1, "2026-04-01")).toBe(1);
    expect(timeline.tagAsOf(2, "2026-04-01")).toBe(2);

    // On the first night's date: that night's tag-out already applies
    // ("a finish on the date counts" analog — the night's date IS the
    // as-of boundary). Holder 2 out-scores holder 1, so tags swap.
    expect(timeline.tagAsOf(1, "2026-05-01")).toBe(2);
    expect(timeline.tagAsOf(2, "2026-05-01")).toBe(1);

    // Between the two nights: still night 1's outcome.
    expect(timeline.tagAsOf(1, "2026-05-15")).toBe(2);

    // On/after the second night: night 2's outcome (holder 1 now
    // out-scores holder 2, so the tags swap back).
    expect(timeline.tagAsOf(1, "2026-06-01")).toBe(1);
    expect(timeline.tagAsOf(2, "2026-06-01")).toBe(2);
    expect(timeline.tagAsOf(1, "2026-12-31")).toBe(1);
  });
});

describe("computeTagTimeline — non-League-Night and non-existent overrides are inert", () => {
  it("ignores tournament events entirely and overrides for holders with no result", () => {
    const overrides: SeasonSnapshotTagOverride[] = [{ eventId: 999, holderId: 1, tagOut: 5 }];
    const timeline = computeTagTimeline({
      holders: [holder(1, 1), holder(2, 2)],
      events: [
        {
          id: 999,
          sourceType: "TOURNAMENT",
          type: "Tournament",
          eventDate: "2026-05-01",
          roundOrdinal: null,
          canceled: false,
          results: [{ holderId: 1, rawScoreToPar: -5, roundRating: null, tagPresent: true }],
        },
      ],
      tagOverrides: overrides,
    });

    expect(timeline.assignments).toEqual([]);
    expect(timeline.currentTagByHolder.get(1)).toBe(1);
  });
});
