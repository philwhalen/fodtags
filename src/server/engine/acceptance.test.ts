// Spec 02 acceptance criteria — the hand-calculation regression guard
// (plans/common-a/07-testing-ci.md; specs/02-Domain-Model-and-Scoring.md
// "Acceptance criteria"). Pure `computeSeason` fixtures only — no DB.
import { describe, expect, it } from "vitest";

import {
  MINI_SEASON_EXPECTED,
  RESHUFFLE_EXPECTED,
  acceptanceBaseSnapshot,
  acceptanceHolder,
  acceptanceLeagueNight,
  miniSeasonSnapshot,
  reshuffleSnapshot,
} from "@server/engine/acceptance-fixtures";
import { computeSeason } from "@server/engine/season";
import type { SeasonSnapshotEvent } from "@/lib";
import { roundToOneDecimal } from "@/lib";

describe("Spec 02 acceptance criteria", () => {
  describe("mini-season fixture", () => {
    it("reproduces hand-calculated championship totals, per-pool ranks, and computed Podium bonuses", () => {
      const result = computeSeason(miniSeasonSnapshot());

      for (const pool of ["A", "B"] as const) {
        const expectedRows = MINI_SEASON_EXPECTED.championship[pool];
        const actual = result.championship[pool];
        expect(actual).toHaveLength(expectedRows.length);
        expectedRows.forEach((exp, i) => {
          expect(actual[i]!.rank).toBe(i + 1);
          expect(actual[i]!.holderId).toBe(exp.holderId);
          expect(actual[i]!.tagNumber).toBe(exp.tagNumber);
          expect(actual[i]!.totalPoints).toBe(exp.totalPoints);
        });
      }

      const earlyPodium = result.podium.EARLY;
      expect(earlyPodium.complete).toBe(true);
      expect(earlyPodium.A.map((r) => [r.holderId, r.totalPoints])).toEqual(
        MINI_SEASON_EXPECTED.podium.EARLY.A.map((r) => [r.holderId, r.totalPoints]),
      );
      expect(earlyPodium.B.map((r) => [r.holderId, r.totalPoints])).toEqual(
        MINI_SEASON_EXPECTED.podium.EARLY.B.map((r) => [r.holderId, r.totalPoints]),
      );

      // Alice leads on accumulated LN points (200 vs 120), not a tag tie-break.
      expect(result.championship.A[0]!.holderId).toBe(1);
      expect(result.championship.A[0]!.tieBrokenByTag).toBe(false);
    });

    it("excludes the canceled night from OLP round counts", () => {
      const result = computeSeason(miniSeasonSnapshot());
      const olpFor = (id: number) => result.olp.EARLY.find((r) => r.holderId === id)!;

      expect(olpFor(1).rounds).toBe(MINI_SEASON_EXPECTED.olpEarlyRounds.alice);
      expect(olpFor(2).rounds).toBe(MINI_SEASON_EXPECTED.olpEarlyRounds.bob);
      expect(olpFor(3).rounds).toBe(MINI_SEASON_EXPECTED.olpEarlyRounds.carol);
    });
  });

  describe("nightly tag reassignment changes a later tie-break (§2.10/§2.6)", () => {
    it("breaks the night-2 League-Night tie by the tag-in from night 1's reshuffle, not the static roster tag", () => {
      const result = computeSeason(reshuffleSnapshot());

      // Night 1: Bob (holder 2) wins outright on score; the combined-field
      // reassignment then swaps tags so Bob tags-out at 1, Alice at 2.
      const bobNight1 = result.scoreSheet[2]!.countedLineItems.find((i) => i.eventId === 1)!;
      expect(bobNight1.rank).toBe(1);
      expect(bobNight1.tieBrokenByTag).toBe(false);

      // Night 2: tied score, resolved by tag-in (Bob now holds tag 1) —
      // Bob wins, NOT Alice, even though Alice's *static* roster tag (1)
      // is lower than Bob's (2).
      const aliceNight2 = result.scoreSheet[1]!.countedLineItems.find((i) => i.eventId === 2)!;
      const bobNight2 = result.scoreSheet[2]!.countedLineItems.find((i) => i.eventId === 2)!;
      expect(bobNight2.rank).toBe(1);
      expect(bobNight2.points).toBe(100);
      expect(bobNight2.tieBrokenByTag).toBe(true);
      expect(aliceNight2.rank).toBe(2);
      expect(aliceNight2.points).toBe(60);
      expect(aliceNight2.tieBrokenByTag).toBe(true);
      expect(RESHUFFLE_EXPECTED.night2TieWinnerHolderId).toBe(2);
    });

    it("carries the post-reassignment (current) tag, not the static initial tag, on Championship and Podium rows", () => {
      const result = computeSeason(reshuffleSnapshot());

      const champA = result.championship.A;
      const alice = champA.find((r) => r.holderId === RESHUFFLE_EXPECTED.championship.alice.holderId)!;
      const bob = champA.find((r) => r.holderId === RESHUFFLE_EXPECTED.championship.bob.holderId)!;
      expect(alice.tagNumber).toBe(RESHUFFLE_EXPECTED.championship.alice.tagNumber);
      expect(alice.totalPoints).toBe(RESHUFFLE_EXPECTED.championship.alice.totalPoints);
      expect(bob.tagNumber).toBe(RESHUFFLE_EXPECTED.championship.bob.tagNumber);
      expect(bob.totalPoints).toBe(RESHUFFLE_EXPECTED.championship.bob.totalPoints);

      // currentTagByHolder (Overall/write-back target) agrees.
      expect(result.currentTagByHolder[1]).toBe(2);
      expect(result.currentTagByHolder[2]).toBe(1);

      // Podium (EARLY, complete) rows carry the same as-of tag.
      const podiumA = result.podium.EARLY.A;
      const podiumAlice = podiumA.find((r) => r.holderId === 1)!;
      const podiumBob = podiumA.find((r) => r.holderId === 2)!;
      expect(podiumAlice.tagNumber).toBe(2);
      expect(podiumBob.tagNumber).toBe(1);

      // The full timeline is published: 2 nights x 2 holders = 4 rows.
      expect(result.tagAssignments).toHaveLength(4);
      const night1Bob = result.tagAssignments.find((a) => a.eventId === 1 && a.holderId === 2)!;
      expect(night1Bob.tagIn).toBe(2);
      expect(night1Bob.tagOut).toBe(1);
      expect(night1Bob.source).toBe("computed");
    });
  });

  describe("OLP canonical worked examples (§2.8)", () => {
    // 853 rated, +5 avg over 7 rounds, 2 Pool-B wins → 85.3 + 5 − 7 − 2 = 81.3
    it("computes 81.3 exactly", () => {
      const h = acceptanceHolder({ id: 1, tagNumber: 1, basePool: "B", pdgaMembership: true });
      const filler = acceptanceHolder({ id: 2, tagNumber: 2, basePool: "B", pdgaMembership: true });
      const scores = [-1, -1, 7.4, 7.4, 7.4, 7.4, 7.4];
      const events: SeasonSnapshotEvent[] = scores.map((s, i) =>
        acceptanceLeagueNight({
          id: i + 1,
          eventDate: `2026-05-${String(i + 1).padStart(2, "0")}`,
          roundOrdinal: i + 1,
          results: [
            { holderId: 1, rawScoreToPar: s, roundRating: null, tagPresent: true },
            { holderId: 2, rawScoreToPar: 0, roundRating: null, tagPresent: true },
          ],
        }),
      );
      const snapshot = acceptanceBaseSnapshot({
        holders: [h, filler],
        ratings: [{ holderId: 1, effectiveDate: "2026-05-01", rating: 853, official: true }],
        subLeagues: [
          { type: "EARLY", startDate: "2026-05-01", endDate: "2026-05-07", complete: false },
          { type: "MID", startDate: "2026-06-15", endDate: "2026-07-15", complete: false },
          { type: "LATE", startDate: "2026-08-01", endDate: "2026-09-01", complete: false },
        ],
        events,
      });

      const row = computeSeason(snapshot).olp.EARLY.find((r) => r.holderId === 1)!;
      expect(row.rounds).toBe(7);
      expect(row.avgToPar).toBeCloseTo(5, 10);
      expect(row.poolWins).toBe(2);
      expect(row.ratingComponent).toBeCloseTo(85.3, 10);
      expect(roundToOneDecimal(row.score)).toBe(81.3);
    });

    // 937 rated, −3.3 avg over 6 rounds, 3 Pool-A wins → 93.7 − 3.3 − 6 − 3 = 81.4
    it("computes 81.4 exactly", () => {
      const h = acceptanceHolder({ id: 1, tagNumber: 1, basePool: "A", pdgaMembership: true });
      const filler = acceptanceHolder({ id: 2, tagNumber: 2, basePool: "A", pdgaMembership: true });
      const scores = [-10, -10, -10, 3.4, 3.4, 3.4];
      const events: SeasonSnapshotEvent[] = scores.map((s, i) =>
        acceptanceLeagueNight({
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
      const snapshot = acceptanceBaseSnapshot({
        holders: [h, filler],
        ratings: [{ holderId: 1, effectiveDate: "2026-06-01", rating: 937, official: true }],
        events,
      });

      const row = computeSeason(snapshot).olp.MID.find((r) => r.holderId === 1)!;
      expect(row.rounds).toBe(6);
      expect(row.avgToPar).toBeCloseTo(-3.3, 10);
      expect(row.poolWins).toBe(3);
      expect(row.ratingComponent).toBeCloseTo(93.7, 10);
      expect(roundToOneDecimal(row.score)).toBe(81.4);
    });
  });

  describe("dropped results beyond top-N caps (§2.5)", () => {
    it("identifies capped League Nights in droppedLineItems with reason cap", () => {
      const h = acceptanceHolder({ id: 1, tagNumber: 1 });
      const filler = acceptanceHolder({ id: 2, tagNumber: 2 });
      const events: SeasonSnapshotEvent[] = Array.from({ length: 18 }, (_, i) =>
        acceptanceLeagueNight({
          id: i + 1,
          eventDate: `2026-05-${String(i + 1).padStart(2, "0")}`,
          roundOrdinal: i + 1,
          results: [
            {
              holderId: 1,
              rawScoreToPar: i % 2 === 0 ? -10 : 5,
              roundRating: null,
              tagPresent: true,
            },
            { holderId: 2, rawScoreToPar: 0, roundRating: null, tagPresent: true },
          ],
        }),
      );
      const sheet = computeSeason(
        acceptanceBaseSnapshot({ holders: [h, filler], events }),
      ).scoreSheet[1]!;

      const counted = sheet.countedLineItems.filter((i) => i.type === "LeagueNight");
      const dropped = sheet.droppedLineItems.filter(
        (i) => i.type === "LeagueNight" && i.droppedReason === "cap",
      );
      // Best 15 of 18: nine 100-pt nights kept, six 60-pt nights kept, three 60-pt dropped.
      expect(counted).toHaveLength(15);
      expect(dropped).toHaveLength(3);
      expect(dropped.every((i) => i.points === 60)).toBe(true);
      expect(sheet.total).toBe(counted.reduce((sum, i) => sum + i.points, 0));
    });
  });

  describe("canceled League Night (§2.7)", () => {
    it("contributes zero championship points and zero OLP round counts", () => {
      const h = acceptanceHolder({ id: 1, tagNumber: 1, pdgaMembership: true });
      const snapshot = acceptanceBaseSnapshot({
        holders: [h],
        ratings: [{ holderId: 1, effectiveDate: "2026-05-01", rating: 900, official: true }],
        events: [
          acceptanceLeagueNight({
            id: 1,
            eventDate: "2026-05-01",
            results: [{ holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true }],
          }),
          acceptanceLeagueNight({
            id: 2,
            eventDate: "2026-05-08",
            roundOrdinal: 2,
            canceled: true,
            results: [{ holderId: 1, rawScoreToPar: 999, roundRating: null, tagPresent: true }],
          }),
        ],
      });

      const result = computeSeason(snapshot);
      expect(result.scoreSheet[1]!.total).toBe(100);
      expect(result.scoreSheet[1]!.countedLineItems).toHaveLength(1);
      expect(result.scoreSheet[1]!.droppedLineItems).toHaveLength(0);

      const olp = result.olp.EARLY.find((r) => r.holderId === 1)!;
      expect(olp.rounds).toBe(1);
      expect(olp.avgToPar).toBe(-10);
    });
  });

  describe("Pool B rating gate at 920 (§2.2)", () => {
    it("stops Pool B point accrual once the official rating reaches 920", () => {
      const h = acceptanceHolder({ id: 1, tagNumber: 1, basePool: "B", ratingAtEntry: 850 });
      const snapshot = acceptanceBaseSnapshot({
        holders: [h],
        ratings: [
          { holderId: 1, effectiveDate: "2026-04-01", rating: 850, official: true },
          { holderId: 1, effectiveDate: "2026-06-01", rating: 925, official: true },
        ],
        events: [
          acceptanceLeagueNight({
            id: 1,
            eventDate: "2026-05-01",
            results: [{ holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true }],
          }),
          acceptanceLeagueNight({
            id: 2,
            eventDate: "2026-06-15",
            roundOrdinal: 2,
            sourceType: "MID",
            results: [{ holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true }],
          }),
        ],
      });

      const items = computeSeason(snapshot).scoreSheet[1]!.countedLineItems.filter(
        (i) => i.type === "LeagueNight",
      );
      expect(items.find((i) => i.eventDate === "2026-05-01")?.points).toBe(100);
      expect(items.find((i) => i.eventDate === "2026-06-15")?.points).toBe(0);
    });
  });

  describe("pool switch forfeiture (§2.2)", () => {
    it("moves pre-switch points to droppedLineItems with reason forfeited", () => {
      const h = acceptanceHolder({ id: 1, tagNumber: 1, basePool: "A" });
      const snapshot = acceptanceBaseSnapshot({
        holders: [h],
        poolSwitches: [{ holderId: 1, effectiveDate: "2026-05-15", toPool: "B" }],
        events: [
          acceptanceLeagueNight({
            id: 1,
            eventDate: "2026-05-01",
            results: [{ holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true }],
          }),
          acceptanceLeagueNight({
            id: 2,
            eventDate: "2026-05-20",
            roundOrdinal: 2,
            results: [{ holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true }],
          }),
        ],
      });

      const sheet = computeSeason(snapshot).scoreSheet[1]!;
      expect(sheet.total).toBe(100);
      expect(sheet.countedLineItems).toHaveLength(1);
      expect(sheet.countedLineItems[0]!.eventDate).toBe("2026-05-20");
      const forfeited = sheet.droppedLineItems.find((i) => i.droppedReason === "forfeited");
      expect(forfeited?.eventDate).toBe("2026-05-01");
      expect(forfeited?.points).toBe(100);
    });
  });

  describe("OLP largest-remainder payout (§2.8)", () => {
    it("splits the sub-league pot 50/30/20 so payouts sum exactly to the pot", () => {
      const holders = [1, 2, 3, 4].map((id) =>
        acceptanceHolder({ id, tagNumber: id, pdgaMembership: true }),
      );
      const events: SeasonSnapshotEvent[] = Array.from({ length: 4 }, (_, i) =>
        acceptanceLeagueNight({
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

      const result = computeSeason(
        acceptanceBaseSnapshot({
          holders,
          events,
          entryCounts: [{ subLeagueType: "EARLY", paidEntries: MINI_SEASON_EXPECTED.olpPotEarly }],
          subLeagues: [
            { type: "EARLY", startDate: "2026-05-01", endDate: "2026-05-04", complete: true },
            { type: "MID", startDate: "2026-06-15", endDate: "2026-07-15", complete: false },
            { type: "LATE", startDate: "2026-08-01", endDate: "2026-09-01", complete: false },
          ],
        }),
      );

      expect(result.olpPot.EARLY).toBe(MINI_SEASON_EXPECTED.olpPotEarly);
      const paid = result.olp.EARLY.filter((r) => r.payout !== null);
      expect(paid).toHaveLength(3);
      expect(paid.reduce((sum, r) => sum + (r.payout ?? 0), 0)).toBe(MINI_SEASON_EXPECTED.olpPotEarly);
      // 23 × 50/30/20 → floors 11/6/4 (=21); remainders .5/.9/.6 → +1 to 2nd, +1 to 3rd → 11/7/5.
      expect(paid.find((r) => r.rank === 1)?.payout).toBe(11);
      expect(paid.find((r) => r.rank === 2)?.payout).toBe(7);
      expect(paid.find((r) => r.rank === 3)?.payout).toBe(5);
    });
  });
});
