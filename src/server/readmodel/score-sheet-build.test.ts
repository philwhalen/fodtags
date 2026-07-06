// Score-sheet read-model build tests (plans/score-sheets/02-readmodel-build.md
// "Tests" 1-7): the seed fixture -> `buildAndPublish` -> `getPublished`
// returns `score-sheet/pool-*` payloads whose holder order mirrors the
// Championship standing, whose counted-sum reconciles with `total`, whose
// dropped items carry the right reason (top-N cap vs pool-switch
// forfeiture), whose projected Podium line moves to counted once a
// sub-league completes, and whose labels/names resolve via `listEvents` /
// `nameById` with a documented fallback.
//
// Same dynamic-import pattern as build.test.ts / olp-integration.test.ts:
// `@server/config` freezes `process.env` at first import, so `DATA_DIR`
// must be set before any server module loads. `@/lib` (pure, client-safe)
// is imported statically since it has no such dependency, as are
// type-only imports from `@server/readmodel/build` (erased at compile
// time, so they never trigger a runtime module load).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildCanonicalSlugs } from "@/lib";
import type {
  Pool,
  PublicScoreSheetPayload,
  SeasonResults,
  SeasonSnapshot,
} from "@/lib";
import type { StandingsViewPayload, ViewRow } from "@server/readmodel/build";

const SEASON_YEAR = 2026;
const EMPTY_SEASON_YEAR = 2099;

let tempDir: string;
let buildViews: (seasonYear: number) => ViewRow[];
let buildAndPublish: (seasonYear: number) => number;
let getPublished: (
  seasonYear: number,
  viewKey: string,
) => { payload: unknown } | undefined;
let listHolders: (
  seasonYear: number,
) => { id: number; name: string; tagNumber: number; pool: Pool }[];
let insertHolder: (input: {
  seasonYear: number;
  name: string;
  tagNumber: number;
  pool: Pool;
  entryDate: string;
}) => number;
let listSources: (seasonYear: number) => { id: number; type: string }[];
let updateSource: (id: number, patch: { complete?: boolean }) => void;
let insertEvent: (input: {
  seasonYear: number;
  eventSourceId: number;
  type: "LeagueNight";
  label: string;
  eventDate: string;
  roundOrdinal: number;
}) => number;
let insertResult: (input: {
  seasonYear: number;
  eventId: number;
  displayName: string;
  holderId?: number | null;
  rawScoreToPar: number;
}) => number;
let insertSwitch: (input: {
  seasonYear: number;
  holderId: number;
  effectiveDate: string;
  fromPool: Pool;
  toPool: Pool;
  approvedBy: string;
}) => number;
let loadSeasonSnapshot: (seasonYear: number) => SeasonSnapshot;
let computeSeason: (snapshot: SeasonSnapshot) => SeasonResults;
let buildScoreSheetViews: (
  seasonYear: number,
  results: SeasonResults,
  nameById: Map<number, string>,
  slugById: Map<number, string>,
  tournamentSourceCount: number,
  updatedAt: string,
  pendingReview: number,
) => ViewRow[];
let dbInsertSeason: (year: number) => void;

let alexId: number;
let samId: number;
let caseyId: number;
let midSourceId: number;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "fodtags-vitest-score-sheet-build-"),
  );
  process.env.DATA_DIR = tempDir;

  const [
    { applyMigrations },
    { seed },
    readmodel,
    readModelRepo,
    tagHoldersRepo,
    eventSourcesRepo,
    eventsRepo,
    resultsRepo,
    poolSwitchesRepo,
    seasonSnapshotRepo,
    engine,
    scoreSheetBuild,
    dbClient,
    schema,
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/readmodel"),
    import("@server/db/repositories/readModel"),
    import("@server/db/repositories/tagHolders"),
    import("@server/db/repositories/eventSources"),
    import("@server/db/repositories/events"),
    import("@server/db/repositories/eventResults"),
    import("@server/db/repositories/poolSwitches"),
    import("@server/db/repositories/seasonSnapshot"),
    import("@server/engine"),
    import("@server/readmodel/score-sheet-build"),
    import("@server/db/client"),
    import("@server/db/schema"),
  ]);

  buildViews = readmodel.buildViews;
  buildAndPublish = readmodel.buildAndPublish;
  getPublished = readModelRepo.getPublished;
  listHolders = tagHoldersRepo.listHolders;
  insertHolder = tagHoldersRepo.insertHolder;
  listSources = eventSourcesRepo.listSources;
  updateSource = eventSourcesRepo.updateSource;
  insertEvent = eventsRepo.insertEvent;
  insertResult = resultsRepo.insertResult;
  insertSwitch = poolSwitchesRepo.insertSwitch;
  loadSeasonSnapshot = seasonSnapshotRepo.loadSeasonSnapshot;
  computeSeason = engine.computeSeason;
  buildScoreSheetViews = scoreSheetBuild.buildScoreSheetViews;
  dbInsertSeason = (year: number) => {
    dbClient.db.insert(schema.seasons).values({ year }).run();
  };

  applyMigrations();
  seed();

  const holders = listHolders(SEASON_YEAR);
  alexId = holders.find((h) => h.name === "Alex Rivera")!.id;
  samId = holders.find((h) => h.name === "Sam Patel")!.id;
  caseyId = holders.find((h) => h.name === "Casey Nguyen")!.id;
  midSourceId = listSources(SEASON_YEAR).find((s) => s.type === "MID")!.id;
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

function poolPayload(pool: "a" | "b"): PublicScoreSheetPayload {
  buildAndPublish(SEASON_YEAR);
  const view = getPublished(SEASON_YEAR, `score-sheet/pool-${pool}`);
  expect(view).toBeDefined();
  return view!.payload as PublicScoreSheetPayload;
}

describe("score-sheet build (plans/score-sheets/02-readmodel-build.md)", () => {
  it("1. holder order/rank/tieBrokenByTag matches championship/pool-*", () => {
    buildAndPublish(SEASON_YEAR);
    for (const pool of ["a", "b"] as const) {
      const championship = getPublished(SEASON_YEAR, `championship/pool-${pool}`)!
        .payload as StandingsViewPayload;
      const scoreSheet = poolPayload(pool);

      expect(scoreSheet.pool).toBe(pool.toUpperCase());
      expect(scoreSheet.holders.map((h) => h.holderId)).toEqual(
        championship.rows.map((r) => r.playerId),
      );
      scoreSheet.holders.forEach((h, i) => {
        const row = championship.rows[i]!;
        expect(h.rank).toBe(row.rank);
        expect(h.tagNumber).toBe(row.tagNumber);
        expect(h.tieBrokenByTag).toBe(row.tieBrokenByTag);
      });
    }
  });

  it("2. counted-sum reconciles with total and byType; dropped lines always carry a reason", () => {
    for (const pool of ["a", "b"] as const) {
      const payload = poolPayload(pool);
      for (const holder of payload.holders) {
        const countedSum = holder.counted.reduce((acc, l) => acc + l.points, 0);
        expect(countedSum).toBe(holder.total);

        const byTypeSum = Object.values(holder.byType).reduce((a, b) => a + b, 0);
        expect(byTypeSum).toBe(holder.total);

        expect(holder.dropped.every((l) => l.droppedReason !== undefined)).toBe(true);
        expect(holder.counted.every((l) => l.droppedReason === undefined)).toBe(true);
      }
      expect(payload.caps).toEqual({
        leagueNight: 15,
        tournament: 2,
        tournamentSourceCount: 0,
        fodOpen: 1,
      });
    }
  });

  it("3. labels/roundOrdinal resolve via listEvents; an unresolved holder name falls back to 'Holder #id'", () => {
    const poolA = poolPayload("a");
    const alex = poolA.holders.find((h) => h.holderId === alexId)!;
    const earlyLn1 = alex.counted.find(
      (l) => l.type === "LeagueNight" && l.label === "Early League Night 1",
    );
    expect(earlyLn1).toBeDefined();
    expect(earlyLn1!.roundOrdinal).toBe(1);

    // Direct call exercising the unresolved-name fallback branch: no engine
    // change, no DB re-seed — just a `nameById` that omits every holder.
    const snapshot = loadSeasonSnapshot(SEASON_YEAR);
    const results = computeSeason(snapshot);
    const views = buildScoreSheetViews(
      SEASON_YEAR,
      results,
      new Map(),
      new Map(),
      snapshot.tournamentSourceCount,
      new Date().toISOString(),
      0,
    );
    const noNamesPoolA = views.find((v) => v.viewKey === "score-sheet/pool-a")!
      .payload as PublicScoreSheetPayload;
    const alexNoName = noNamesPoolA.holders.find((h) => h.holderId === alexId)!;
    expect(alexNoName.name).toBe(`Holder #${alexId}`);
    expect(alexNoName.slug).toBe(String(alexId));
  });

  it("4. League-Night cap: >15 MID League Nights for one holder drops the excess with reason 'cap'", () => {
    for (let i = 0; i < 20; i++) {
      const eventId = insertEvent({
        seasonYear: SEASON_YEAR,
        eventSourceId: midSourceId,
        type: "LeagueNight",
        label: `Cap Test MID Night ${i + 1}`,
        eventDate: `2026-06-${String(i + 1).padStart(2, "0")}`,
        roundOrdinal: 10 + i,
      });
      insertResult({
        seasonYear: SEASON_YEAR,
        eventId,
        holderId: caseyId,
        displayName: "Casey Nguyen",
        rawScoreToPar: -1,
      });
    }

    const payload = poolPayload("b");
    const casey = payload.holders.find((h) => h.holderId === caseyId)!;
    const countedLn = casey.counted.filter((l) => l.type === "LeagueNight");
    const droppedLn = casey.dropped.filter((l) => l.type === "LeagueNight");

    expect(countedLn.length).toBe(15);
    expect(droppedLn.length).toBe(5);
    expect(droppedLn.every((l) => l.droppedReason === "cap")).toBe(true);
    expect(payload.caps.leagueNight).toBe(15);

    // Reconciliation still holds with the cap engaged.
    const countedSum = casey.counted.reduce((acc, l) => acc + l.points, 0);
    expect(countedSum).toBe(casey.total);
  });

  it("5. tournament cap: caps.tournament is 2 at tournamentSourceCount<=3 and 3 at >=4, dropped/counted flip accordingly", () => {
    // A hand-built minimal SeasonSnapshot (no DB event-source rows involved
    // — the schema's one-TOURNAMENT-source-per-season unique index would
    // otherwise block seeding a real 3-vs-4 crossing) with a single holder
    // and 3 uncapped Tournament results, varying only `tournamentSourceCount`
    // — the same field the engine itself reads for the best-2-vs-3 rule
    // (season.ts Stage B), so this exercises the exact boundary the read
    // model needs to reflect.
    const holderId = 9001;
    const buildSnapshot = (tournamentSourceCount: number): SeasonSnapshot => ({
      seasonYear: SEASON_YEAR,
      holders: [
        {
          id: holderId,
          tagNumber: 99,
          basePool: "A",
          entryDate: "2026-01-01",
          pdgaNumber: 999999,
          pdgaMembership: true,
          ratingAtEntry: 1000,
          active: true,
        },
      ],
      poolSwitches: [],
      ratings: [],
      subLeagues: (["EARLY", "MID", "LATE"] as const).map((type) => ({
        type,
        startDate: null,
        endDate: null,
        complete: false,
      })),
      tournamentSourceCount,
      events: [1, 2, 3].map((n) => ({
        id: -n,
        sourceType: "TOURNAMENT" as const,
        type: "Tournament" as const,
        eventDate: `2026-06-0${n}`,
        roundOrdinal: null,
        canceled: false,
        results: [{ holderId, rawScoreToPar: -n, roundRating: null, tagPresent: true }],
      })),
      entryCounts: [],
    });

    function tournamentLines(tournamentSourceCount: number) {
      const results = computeSeason(buildSnapshot(tournamentSourceCount));
      const views = buildScoreSheetViews(
        SEASON_YEAR,
        results,
        new Map([[holderId, "Cap Test Holder"]]),
        buildCanonicalSlugs([{ id: holderId, name: "Cap Test Holder", tagNumber: 99 }]),
        tournamentSourceCount,
        new Date().toISOString(),
        0,
      );
      const poolA = views.find((v) => v.viewKey === "score-sheet/pool-a")!
        .payload as PublicScoreSheetPayload;
      const holder = poolA.holders.find((h) => h.holderId === holderId)!;
      return {
        caps: poolA.caps,
        counted: holder.counted.filter((l) => l.type === "Tournament"),
        dropped: holder.dropped.filter((l) => l.type === "Tournament"),
      };
    }

    const at3 = tournamentLines(3);
    expect(at3.caps.tournament).toBe(2);
    expect(at3.caps.tournamentSourceCount).toBe(3);
    expect(at3.counted.length).toBe(2);
    expect(at3.dropped.length).toBe(1);
    expect(at3.dropped[0]!.droppedReason).toBe("cap");

    const at4 = tournamentLines(4);
    expect(at4.caps.tournament).toBe(3);
    expect(at4.caps.tournamentSourceCount).toBe(4);
    expect(at4.counted.length).toBe(3);
    expect(at4.dropped.length).toBe(0);
  });

  it("6. projected Podium (MID incomplete) becomes a counted line once MID is marked complete + rebuilt", () => {
    const before = poolPayload("a");
    const alexBefore = before.holders.find((h) => h.holderId === alexId)!;
    expect(alexBefore.projectedPodium.some((l) => l.subLeague === "MID")).toBe(true);
    expect(
      alexBefore.counted.some((l) => l.type === "Podium" && l.subLeague === "MID"),
    ).toBe(false);
    const totalBefore = alexBefore.total;
    const podiumBefore = alexBefore.byType.Podium;

    updateSource(midSourceId, { complete: true });
    try {
      const after = poolPayload("a");
      const alexAfter = after.holders.find((h) => h.holderId === alexId)!;

      expect(alexAfter.projectedPodium).toEqual([]);
      const countedMidPodium = alexAfter.counted.find(
        (l) => l.type === "Podium" && l.subLeague === "MID",
      );
      expect(countedMidPodium).toBeDefined();
      expect(alexAfter.total).toBeGreaterThan(totalBefore);
      expect(alexAfter.byType.Podium).toBeGreaterThan(podiumBefore);
    } finally {
      updateSource(midSourceId, { complete: false });
      buildAndPublish(SEASON_YEAR);
    }
  });

  it("7. pool switch: pre-switch items are forfeited (dropped) and the holder appears only under the current pool", () => {
    const preSwitchEventId = insertEvent({
      seasonYear: SEASON_YEAR,
      eventSourceId: midSourceId,
      type: "LeagueNight",
      label: "Switch Test MID Night",
      eventDate: "2026-05-22",
      roundOrdinal: 89,
    });
    insertResult({
      seasonYear: SEASON_YEAR,
      eventId: preSwitchEventId,
      holderId: samId,
      displayName: "Sam Patel",
      rawScoreToPar: -2,
    });

    insertSwitch({
      seasonYear: SEASON_YEAR,
      holderId: samId,
      effectiveDate: "2026-06-01",
      fromPool: "A",
      toPool: "B",
      approvedBy: "director@example.com",
    });

    const poolA = poolPayload("a");
    const poolB = poolPayload("b");

    expect(poolA.holders.some((h) => h.holderId === samId)).toBe(false);
    const sam = poolB.holders.find((h) => h.holderId === samId);
    expect(sam).toBeDefined();

    const forfeitedLine = sam!.dropped.find((l) => l.droppedReason === "forfeited");
    expect(forfeitedLine).toBeDefined();
    expect(forfeitedLine!.pool).toBe("A");
    expect(sam!.counted.length).toBe(0);
    expect(sam!.total).toBe(0);
  });

  it("empty/pre-season: holders present at total 0 with empty line arrays; caps still present", () => {
    dbInsertSeason(EMPTY_SEASON_YEAR);
    const holderAId = insertHolder({
      seasonYear: EMPTY_SEASON_YEAR,
      name: "Preseason Holder A",
      tagNumber: 1,
      pool: "A",
      entryDate: "2026-01-01",
    });
    const holderBId = insertHolder({
      seasonYear: EMPTY_SEASON_YEAR,
      name: "Preseason Holder B",
      tagNumber: 2,
      pool: "B",
      entryDate: "2026-01-01",
    });

    buildAndPublish(EMPTY_SEASON_YEAR);
    const poolA = getPublished(EMPTY_SEASON_YEAR, "score-sheet/pool-a")!
      .payload as PublicScoreSheetPayload;
    const poolB = getPublished(EMPTY_SEASON_YEAR, "score-sheet/pool-b")!
      .payload as PublicScoreSheetPayload;

    const a = poolA.holders.find((h) => h.holderId === holderAId)!;
    expect(a).toBeDefined();
    expect(a.total).toBe(0);
    expect(a.counted).toEqual([]);
    expect(a.dropped).toEqual([]);
    expect(a.projectedPodium).toEqual([]);

    const b = poolB.holders.find((h) => h.holderId === holderBId)!;
    expect(b).toBeDefined();
    expect(b.total).toBe(0);

    expect(poolA.caps).toEqual({
      leagueNight: 15,
      tournament: 2,
      tournamentSourceCount: 0,
      fodOpen: 1,
    });
  });

  it("includes score-sheet/pool-a and pool-b in buildViews output", () => {
    const views = buildViews(SEASON_YEAR);
    expect(views.some((v) => v.viewKey === "score-sheet/pool-a")).toBe(true);
    expect(views.some((v) => v.viewKey === "score-sheet/pool-b")).toBe(true);
  });
});
