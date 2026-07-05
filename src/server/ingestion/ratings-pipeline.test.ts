// Official-ratings pipeline integration test (sub-plan 07).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { RunRatingsRefreshInput, RunRatingsRefreshSummary } from "@server/ingestion/ratings-pipeline";
import type { RunRefreshInput, RunRefreshSummary } from "@server/ingestion/pipeline";

const SEASON_YEAR = 2026;
const EFFECTIVE_DATE = "2026-06-09";

const FIXTURE_HOLDERS = [
  { pdgaNumber: 211843, rating: 952, tagNumber: 21 },
  { pdgaNumber: 125890, rating: 948, tagNumber: 22 },
  { pdgaNumber: 251170, rating: 911, tagNumber: 24 },
] as const;

let tempDir: string;
let runRatingsRefresh: (input: RunRatingsRefreshInput) => Promise<RunRatingsRefreshSummary>;
let runRefresh: (input: RunRefreshInput) => Promise<RunRefreshSummary>;
let resetSingleFlight: () => void;
let insertHolder: (input: {
  seasonYear: number;
  name: string;
  tagNumber: number;
  pool: "A" | "B";
  entryDate: string;
  pdgaNumber: number;
  ratingAtEntry: number;
  pdgaMembership: boolean;
}) => number;
let insertRating: (input: {
  seasonYear: number;
  holderId: number;
  effectiveDate: string;
  rating: number;
  official?: boolean;
}) => void;
let listRatingsBySeason: (seasonYear: number) => Array<{
  holderId: number;
  effectiveDate: string;
  rating: number;
  official: boolean;
}>;
let listRuns: (seasonYear: number, limit?: number) => Array<{ status: string; counts: unknown }>;
let listSources: (seasonYear: number) => Array<{ id: number; type: string }>;
let updateSource: (id: number, patch: { active?: boolean }) => void;
let loadSeasonSnapshot: (seasonYear: number) => import("@/lib").SeasonSnapshot;
let computeSeason: (snapshot: import("@/lib").SeasonSnapshot) => import("@/lib").SeasonResults;
let parsePlayerRatingHtml: (html: string, pdgaNumber: number) => { rating: number; asOfDate?: string };
let secondTuesdayOfMonth: (year: number, month: number, timeZone: string) => string;

const fixtureHolderIds = new Map<number, number>();
let poolBGatedHolderId: number;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-ratings-"));
  process.env.DATA_DIR = tempDir;
  process.env.PDGA_SOURCE = "fixture";

  const [
    { applyMigrations },
    { seed },
    ratingsPipeline,
    pipeline,
    tagHoldersRepo,
    ratingsHistoryRepo,
    refreshRunsRepo,
    eventSourcesRepo,
    seasonSnapshotRepo,
    engine,
    ratingsSource,
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/ingestion/ratings-pipeline"),
    import("@server/ingestion/pipeline"),
    import("@server/db/repositories/tagHolders"),
    import("@server/db/repositories/ratingsHistory"),
    import("@server/db/repositories/refreshRuns"),
    import("@server/db/repositories/eventSources"),
    import("@server/db/repositories/seasonSnapshot"),
    import("@server/engine/season"),
    import("@server/ingestion/pdga/ratings-source"),
  ]);

  runRatingsRefresh = ratingsPipeline.runRatingsRefresh;
  runRefresh = pipeline.runRefresh;
  resetSingleFlight = pipeline.__resetSingleFlightForTests;
  insertHolder = tagHoldersRepo.insertHolder;
  insertRating = ratingsHistoryRepo.insertRating;
  listRatingsBySeason = ratingsHistoryRepo.listRatingsBySeason;
  listRuns = refreshRunsRepo.listRuns;
  listSources = eventSourcesRepo.listSources;
  updateSource = eventSourcesRepo.updateSource;
  loadSeasonSnapshot = seasonSnapshotRepo.loadSeasonSnapshot;
  computeSeason = engine.computeSeason;
  parsePlayerRatingHtml = ratingsSource.parsePlayerRatingHtml;
  secondTuesdayOfMonth = ratingsPipeline.secondTuesdayOfMonth;

  applyMigrations();
  seed();

  for (const source of listSources(SEASON_YEAR)) {
    if (source.type === "MID" || source.type === "LATE") {
      updateSource(source.id, { active: false });
    }
  }

  for (const fixture of FIXTURE_HOLDERS) {
    const id = insertHolder({
      seasonYear: SEASON_YEAR,
      name: `Fixture Player ${fixture.pdgaNumber}`,
      tagNumber: fixture.tagNumber,
      pool: "A",
      entryDate: "2026-01-15T00:00:00.000Z",
      pdgaNumber: fixture.pdgaNumber,
      ratingAtEntry: fixture.rating,
      pdgaMembership: true,
    });
    fixtureHolderIds.set(fixture.pdgaNumber, id);
  }

  poolBGatedHolderId = insertHolder({
    seasonYear: SEASON_YEAR,
    name: "Pool B Gating Test",
    tagNumber: 25,
    pool: "B",
    entryDate: "2026-01-15T00:00:00.000Z",
    pdgaNumber: 216896,
    ratingAtEntry: 860,
    pdgaMembership: true,
  });

  await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });
  resetSingleFlight();
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

describe("ratings HTML parser", () => {
  it("extracts the current rating and as-of date from a recorded fixture", () => {
    const html = fs.readFileSync(
      path.join(
        path.dirname(new URL(import.meta.url).pathname),
        "pdga/__fixtures__/ratings/player-211843.html",
      ),
      "utf8",
    );
    const parsed = parsePlayerRatingHtml(html, 211843);
    expect(parsed.rating).toBe(952);
    expect(parsed.asOfDate).toBe("2026-06-09");
  });
});

describe("secondTuesdayOfMonth", () => {
  it("returns 2026-06-09 for June 2026 in America/New_York", () => {
    expect(secondTuesdayOfMonth(2026, 6, "America/New_York")).toBe("2026-06-09");
  });
});

describe("runRatingsRefresh", () => {
  it("gates Pool B accrual by the official rating, not an unofficial row", async () => {
    insertRating({
      seasonYear: SEASON_YEAR,
      holderId: poolBGatedHolderId,
      effectiveDate: "2026-05-01",
      rating: 918,
      official: false,
    });

    const lineItems = (sheet: import("@/lib").ScoreSheetEntry | undefined) =>
      [...(sheet?.countedLineItems ?? []), ...(sheet?.droppedLineItems ?? [])];

    const before = computeSeason(loadSeasonSnapshot(SEASON_YEAR));
    const beforeItems = lineItems(before.scoreSheet[poolBGatedHolderId]).filter(
      (line) => line.pool === "B" && line.eventDate >= EFFECTIVE_DATE && line.type === "LeagueNight",
    );
    expect(beforeItems.some((line) => line.points > 0)).toBe(true);

    resetSingleFlight();
    await runRatingsRefresh({
      trigger: "manual",
      seasonYear: SEASON_YEAR,
      effectiveDate: EFFECTIVE_DATE,
    });

    const after = computeSeason(loadSeasonSnapshot(SEASON_YEAR));
    const afterItems = lineItems(after.scoreSheet[poolBGatedHolderId]).filter(
      (line) => line.pool === "B" && line.eventDate >= EFFECTIVE_DATE && line.type === "LeagueNight",
    );
    expect(afterItems.length).toBeGreaterThan(0);
    expect(afterItems.every((line) => line.points === 0)).toBe(true);

    const officialRow = listRatingsBySeason(SEASON_YEAR).find(
      (r) =>
        r.holderId === poolBGatedHolderId &&
        r.official &&
        r.effectiveDate === EFFECTIVE_DATE,
    );
    expect(officialRow?.rating).toBe(927);
  });

  it("writes official=true rows for rostered fixture PDGA numbers at the effective date", async () => {
    resetSingleFlight();
    const summary = await runRatingsRefresh({
      trigger: "manual",
      seasonYear: SEASON_YEAR,
      effectiveDate: EFFECTIVE_DATE,
    });

    expect(summary.outcome).toBe("completed");
    expect(summary.status).toBe("succeeded");
    expect(summary.effectiveDate).toBe(EFFECTIVE_DATE);
    expect(summary.holdersSucceeded).toBeGreaterThanOrEqual(FIXTURE_HOLDERS.length);

    const ratings = listRatingsBySeason(SEASON_YEAR).filter((r) => r.official);
    for (const fixture of FIXTURE_HOLDERS) {
      const holderId = fixtureHolderIds.get(fixture.pdgaNumber)!;
      const row = ratings.find(
        (r) => r.holderId === holderId && r.effectiveDate === EFFECTIVE_DATE,
      );
      expect(row).toMatchObject({ rating: fixture.rating, official: true });
    }

    const latestRun = listRuns(SEASON_YEAR, 1)[0];
    expect(latestRun?.status).toBe("succeeded");
    expect(latestRun?.counts).toMatchObject({
      kind: "ratings",
      effectiveDate: EFFECTIVE_DATE,
    });
  });

  it("single-flights with an in-flight runRefresh into exactly one refresh_runs row", async () => {
    resetSingleFlight();
    const runCountBefore = listRuns(SEASON_YEAR, 1000).length;

    const refreshPromise = runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });
    const ratingsPromise = runRatingsRefresh({
      trigger: "manual",
      seasonYear: SEASON_YEAR,
      effectiveDate: EFFECTIVE_DATE,
    });

    const [refresh, ratings] = await Promise.all([refreshPromise, ratingsPromise]);
    const runCountAfter = listRuns(SEASON_YEAR, 1000).length;

    expect(runCountAfter - runCountBefore).toBe(1);
    expect(refresh.runId).toBe(ratings.runId);
    expect([refresh.outcome, ratings.outcome].sort()).toEqual(["completed", "skipped"]);
  });
});

describe("monthly scheduler wiring", () => {
  it("runMonthlyRatingsScheduledRefresh delegates to runRatingsRefresh", async () => {
    const ratingsPipeline = await import("@server/ingestion/ratings-pipeline");
    const spy = vi.spyOn(ratingsPipeline, "runRatingsRefresh").mockResolvedValue({
      outcome: "completed",
      status: "succeeded",
      seasonYear: SEASON_YEAR,
      trigger: "scheduled",
    });

    const { runMonthlyRatingsScheduledRefresh: handler } = await import("@server/jobs/scheduler");
    handler();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(spy).toHaveBeenCalledWith({ trigger: "scheduled", seasonYear: SEASON_YEAR });
    spy.mockRestore();
  });
});
