/**
 * Hand-built Spec 02 acceptance fixtures (plans/common-a/07-testing-ci.md).
 * Pure data — no I/O — shared by `acceptance.test.ts` and documented with
 * the hand calculations each fixture encodes.
 */
import type { SeasonSnapshot, SeasonSnapshotEvent, SeasonSnapshotHolder } from "@/lib";

export const ACCEPTANCE_SEASON_YEAR = 2026;

export function acceptanceHolder(
  overrides: Partial<SeasonSnapshotHolder> & { id: number },
): SeasonSnapshotHolder {
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

export function acceptanceLeagueNight(
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

export function acceptanceBaseSnapshot(
  overrides: Partial<SeasonSnapshot> = {},
): SeasonSnapshot {
  return {
    seasonYear: ACCEPTANCE_SEASON_YEAR,
    holders: [],
    poolSwitches: [],
    ratings: [],
    subLeagues: [
      { type: "EARLY", startDate: "2026-05-01", endDate: "2026-05-08", complete: false },
      { type: "MID", startDate: "2026-06-15", endDate: "2026-07-15", complete: false },
      { type: "LATE", startDate: "2026-08-01", endDate: "2026-09-01", complete: false },
    ],
    tournamentSourceCount: 2,
    events: [],
    entryCounts: [],
    ...overrides,
  };
}

/**
 * Mini-season: EARLY sub-league with two scored League Nights, one
 * canceled night, and `complete: true` so Podium bonuses fold in.
 *
 * Hand calculation (Table 2.1 League Night: 1st 100 / 2nd 60; Podium:
 * 1st 150 / 2nd 100):
 *
 * Night 1 (2026-05-01): Alice (tag 1) -10, Bob (tag 2) -5 → Alice 100,
 *   Bob 60. Carol (tag 3, Pool B) -3 alone → Carol 100.
 * Night 2 (2026-05-08): Alice & Bob both -8 → tie, tag 1 wins (§2.6
 *   "going into that night") → Alice 100, Bob 60. Carol -5 alone → Carol 100.
 * Night 3 (2026-05-15): CANCELED — zero points, zero OLP rounds.
 *
 * EARLY League-Night subtotals: Alice 200, Bob 120, Carol 200.
 * Podium (complete, by accumulated LN points): Alice 1st 150, Bob 2nd 100;
 *   Carol 1st 150 (sole Pool B participant).
 *
 * Championship totals: Alice 350, Bob 220, Carol 350.
 * Per-pool ranks: Pool A — Alice 1 / Bob 2; Pool B — Carol 1.
 */
export function miniSeasonSnapshot(): SeasonSnapshot {
  const alice = acceptanceHolder({ id: 1, tagNumber: 1, basePool: "A", pdgaMembership: true });
  const bob = acceptanceHolder({ id: 2, tagNumber: 2, basePool: "A", pdgaMembership: true });
  const carol = acceptanceHolder({
    id: 3,
    tagNumber: 3,
    basePool: "B",
    pdgaMembership: true,
    ratingAtEntry: 850,
  });

  return acceptanceBaseSnapshot({
    holders: [alice, bob, carol],
    ratings: [{ holderId: 3, effectiveDate: "2026-05-01", rating: 853, official: true }],
    entryCounts: [{ subLeagueType: "EARLY", paidEntries: 23 }],
    subLeagues: [
      { type: "EARLY", startDate: "2026-05-01", endDate: "2026-05-08", complete: true },
      { type: "MID", startDate: "2026-06-15", endDate: "2026-07-15", complete: false },
      { type: "LATE", startDate: "2026-08-01", endDate: "2026-09-01", complete: false },
    ],
    events: [
      acceptanceLeagueNight({
        id: 1,
        eventDate: "2026-05-01",
        roundOrdinal: 1,
        results: [
          { holderId: 1, rawScoreToPar: -10, roundRating: null, tagPresent: true },
          { holderId: 2, rawScoreToPar: -5, roundRating: null, tagPresent: true },
          { holderId: 3, rawScoreToPar: -3, roundRating: null, tagPresent: true },
        ],
      }),
      acceptanceLeagueNight({
        id: 2,
        eventDate: "2026-05-08",
        roundOrdinal: 2,
        results: [
          { holderId: 1, rawScoreToPar: -8, roundRating: null, tagPresent: true },
          { holderId: 2, rawScoreToPar: -8, roundRating: null, tagPresent: true },
          { holderId: 3, rawScoreToPar: -5, roundRating: null, tagPresent: true },
        ],
      }),
      acceptanceLeagueNight({
        id: 3,
        eventDate: "2026-05-15",
        roundOrdinal: 3,
        canceled: true,
        results: [
          { holderId: 1, rawScoreToPar: -20, roundRating: null, tagPresent: true },
          { holderId: 2, rawScoreToPar: -20, roundRating: null, tagPresent: true },
        ],
      }),
    ],
  });
}

/** Expected hand totals for {@link miniSeasonSnapshot}. */
export const MINI_SEASON_EXPECTED = {
  championship: {
    A: [
      { holderId: 1, tagNumber: 1, totalPoints: 350 },
      { holderId: 2, tagNumber: 2, totalPoints: 220 },
    ],
    B: [{ holderId: 3, tagNumber: 3, totalPoints: 350 }],
  },
  podium: {
    EARLY: {
      A: [
        { holderId: 1, totalPoints: 150 },
        { holderId: 2, totalPoints: 100 },
      ],
      B: [{ holderId: 3, totalPoints: 150 }],
    },
  },
  /** Canceled night 3 excluded — only nights 1 & 2 count toward OLP. */
  olpEarlyRounds: { alice: 2, bob: 2, carol: 2 },
  olpPotEarly: 23,
} as const;
