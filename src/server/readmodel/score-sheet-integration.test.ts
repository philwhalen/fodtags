// Score-sheet page integration (plans/score-sheets/04-pages.md).
//
// Asserts the pure composition the `/[season]/score-sheet/[pool]` server
// page performs: seed -> buildAndPublish -> getPublished("score-sheet/pool-*")
// -> projectScoreSheet — plus the invalid-pool guard. The read-model
// correctness itself (championship order, counted-sum reconciliation,
// dropped reasons, tournament-cap boundary, projected->counted Podium,
// pool-switch forfeiture) is already covered exhaustively by
// score-sheet-build.test.ts's "score-sheet build" describe; this file's job
// is the page-level composition layer on top of that — `projectScoreSheet`
// over the published payload — following the rounds-integration.test.ts /
// olp-integration.test.ts precedent (no jsdom/route harness).
//
// Same dynamic-import pattern as build.test.ts / olp-integration.test.ts:
// `@server/config` freezes `process.env` at first import, so `DATA_DIR`
// must be set before any server module loads. `@/lib` (pure, client-safe)
// is imported statically since it has no such dependency.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { isValidPool, projectScoreSheet } from "@/lib";
import type { Pool, PublicScoreSheetPayload } from "@/lib";

const SEASON_YEAR = 2026;
const EMPTY_SEASON_YEAR = 2098;

let tempDir: string;
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
let dbInsertSeason: (year: number) => void;

let alexId: number;
let caseyId: number;
let midSourceId: number;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "fodtags-vitest-score-sheet-page-integration-"),
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
    import("@server/db/client"),
    import("@server/db/schema"),
  ]);

  buildAndPublish = readmodel.buildAndPublish;
  getPublished = readModelRepo.getPublished;
  listHolders = tagHoldersRepo.listHolders;
  insertHolder = tagHoldersRepo.insertHolder;
  listSources = eventSourcesRepo.listSources;
  updateSource = eventSourcesRepo.updateSource;
  insertEvent = eventsRepo.insertEvent;
  insertResult = resultsRepo.insertResult;
  dbInsertSeason = (year: number) => {
    dbClient.db.insert(schema.seasons).values({ year }).run();
  };

  applyMigrations();
  seed();

  const holders = listHolders(SEASON_YEAR);
  alexId = holders.find((h) => h.name === "Alex Rivera")!.id;
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

describe("score-sheet page integration (plans/score-sheets/04-pages.md)", () => {
  it("1. published view shape: score-sheet/pool-a is non-null, holders in championship order, caps present", () => {
    const payload = poolPayload("a");
    expect(payload.pool).toBe("A");
    expect(payload.holders.length).toBeGreaterThan(0);
    // Championship order == non-decreasing rank.
    const ranks = payload.holders.map((h) => h.rank);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
    expect(payload.caps).toEqual({
      leagueNight: 15,
      tournament: 2,
      tournamentSourceCount: 0,
      fodOpen: 1,
    });
  });

  it("2. the page's projection: per-holder groups, counted-sum===total, hasDropped + reasons correct", () => {
    const payload = poolPayload("a");
    const view = projectScoreSheet(payload);
    expect(view.pool).toBe("A");

    for (const holderView of view.holders) {
      const countedFromGroups = holderView.groups.reduce(
        (acc, g) => acc + g.counted.reduce((a, l) => a + l.points, 0),
        0,
      );
      expect(countedFromGroups).toBe(holderView.holder.total);
      expect(holderView.hasDropped).toBe(holderView.holder.dropped.length > 0);
    }

    // Alex Rivera has an incomplete MID sub-league at seed time (score-sheet
    // -build.test.ts case 6 relies on the same fixture fact), so a projected
    // Podium line surfaces flagged (not counted) in the Podium group.
    const alexView = view.holders.find((h) => h.holder.holderId === alexId)!;
    expect(alexView.holder.projectedPodium.length).toBeGreaterThan(0);
    const podiumGroup = alexView.groups.find((g) => g.type === "Podium")!;
    const projectedLines = podiumGroup.dropped.filter((l) => l.projected);
    expect(projectedLines.length).toBeGreaterThan(0);
    expect(projectedLines[0]!.reason).toBe("projected — not final");
  });

  it("2b. dropped reasons: a League-Night cap-dropped line reads 'beyond best 15'", () => {
    // Seed Casey (Pool B) well past the best-15 League-Night cap so the
    // projection's dropped LeagueNight lines are guaranteed to exist and
    // their derived reason text can be asserted deterministically.
    for (let i = 0; i < 20; i++) {
      const eventId = insertEvent({
        seasonYear: SEASON_YEAR,
        eventSourceId: midSourceId,
        type: "LeagueNight",
        label: `Page Integration Cap Night ${i + 1}`,
        eventDate: `2026-06-${String(i + 1).padStart(2, "0")}`,
        roundOrdinal: 200 + i,
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
    const view = projectScoreSheet(payload);
    const caseyView = view.holders.find((h) => h.holder.holderId === caseyId)!;
    const lnGroup = caseyView.groups.find((g) => g.type === "LeagueNight")!;

    expect(lnGroup.dropped.length).toBeGreaterThan(0);
    for (const line of lnGroup.dropped) {
      expect(line.reason).toBe("beyond best 15");
    }
    expect(caseyView.hasDropped).toBe(true);
  });

  it("3. projected Podium becomes counted across updateSource(complete:true) + republish; total grows", () => {
    const before = poolPayload("a");
    const alexBefore = before.holders.find((h) => h.holderId === alexId)!;
    const viewBefore = projectScoreSheet(before);
    const alexViewBefore = viewBefore.holders.find(
      (h) => h.holder.holderId === alexId,
    )!;
    const podiumGroupBefore = alexViewBefore.groups.find((g) => g.type === "Podium")!;
    expect(
      podiumGroupBefore.dropped.some((l) => l.projected && l.title === "Mid Podium"),
    ).toBe(true);
    expect(podiumGroupBefore.counted.some((l) => l.title === "Mid Podium")).toBe(false);

    updateSource(midSourceId, { complete: true });
    try {
      const after = poolPayload("a");
      const alexAfter = after.holders.find((h) => h.holderId === alexId)!;
      expect(alexAfter.total).toBeGreaterThan(alexBefore.total);

      const viewAfter = projectScoreSheet(after);
      const alexViewAfter = viewAfter.holders.find(
        (h) => h.holder.holderId === alexId,
      )!;
      const podiumGroupAfter = alexViewAfter.groups.find((g) => g.type === "Podium")!;
      expect(
        podiumGroupAfter.dropped.some((l) => l.projected && l.title === "Mid Podium"),
      ).toBe(false);
      expect(podiumGroupAfter.counted.some((l) => l.title === "Mid Podium")).toBe(true);
    } finally {
      updateSource(midSourceId, { complete: false });
      buildAndPublish(SEASON_YEAR);
    }
  });

  it("4. empty pool: a pool with no holders publishes with an empty holders array, page's empty branch reachable", () => {
    dbInsertSeason(EMPTY_SEASON_YEAR);
    // Seed only a Pool A holder — Pool B has zero holders for this season.
    insertHolder({
      seasonYear: EMPTY_SEASON_YEAR,
      name: "Solo Pool A Holder",
      tagNumber: 1,
      pool: "A",
      entryDate: "2026-01-01",
    });

    buildAndPublish(EMPTY_SEASON_YEAR);
    const view = getPublished(EMPTY_SEASON_YEAR, "score-sheet/pool-b");
    expect(view).toBeDefined();
    const payload = view!.payload as PublicScoreSheetPayload;

    expect(payload.holders).toEqual([]);
    expect(payload.pool).toBe("B");

    const projection = projectScoreSheet(payload);
    expect(projection.holders).toEqual([]);
  });

  it("5. invalid pool: isValidPool('pool-c') is false, which drives the page's notFound() guard", () => {
    expect(isValidPool("pool-c")).toBe(false);
    expect(isValidPool("pool-a")).toBe(true);
    expect(isValidPool("pool-b")).toBe(true);
  });
});
