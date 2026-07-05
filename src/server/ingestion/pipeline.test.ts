// Pipeline integration test (sub-plan 08): fixture source → full run →
// published championship compared to computeSeason oracle; single-flight preserved.
//
// IMPORTANT — why every server import below is a `import type` or a
// dynamic `import()`, never a plain top-of-file value import:
//
// `@server/config` parses `process.env` ONCE at module load into a frozen
// singleton (see src/server/config/index.ts), and everything under
// `@server/db` / `@server/ingestion` transitively imports it. A static
// `import` here would be hoisted above the `process.env.DATA_DIR = ...`
// assignment we make in `beforeAll`, so config would freeze on whatever
// `DATA_DIR` `vitest.config.ts`'s `test.env` happened to provide — not the
// fresh `fs.mkdtemp` directory this test needs. Instead we set
// `process.env.DATA_DIR` first, then `import()` every server module
// dynamically so its (and its dependencies') top-level evaluation runs
// afterwards. Vitest isolates each test file in its own module registry by
// default, so this doesn't leak into other test files (e.g.
// `olp.test.ts`).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RunRefreshInput, RunRefreshSummary } from "@server/ingestion/pipeline";
import type { StandingsViewPayload } from "@server/readmodel/build";

const SEASON_YEAR = 2026;
const FIXTURE_PDGA_NUMBER = 211843;

let tempDir: string;
let runRefresh: (input: RunRefreshInput) => Promise<RunRefreshSummary>;
let resetSingleFlight: () => void;
let listRuns: (seasonYear: number, limit?: number) => Array<{ status: string }>;
let getCurrentVersion: (seasonYear: number) => number | undefined;
let getPublished: (
  seasonYear: number,
  viewKey: string,
) => { payload: unknown } | undefined;
let loadSeasonSnapshot: (seasonYear: number) => import("@/lib").SeasonSnapshot;
let computeSeason: (snapshot: import("@/lib").SeasonSnapshot) => import("@/lib").SeasonResults;
let listHolders: (seasonYear: number) => Array<{ id: number; name: string }>;
let listSources: (seasonYear: number) => Array<{ id: number; type: string; pdgaEventId: string }>;
let updateSource: (id: number, patch: { active?: boolean }) => void;
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

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-vitest-"));
  process.env.DATA_DIR = tempDir;
  process.env.PDGA_SOURCE = "fixture";

  const [
    { applyMigrations },
    { seed },
    pipeline,
    refreshRunsRepo,
    readModelRepo,
    seasonSnapshotRepo,
    engine,
    tagHoldersRepo,
    eventSourcesRepo,
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/ingestion/pipeline"),
    import("@server/db/repositories/refreshRuns"),
    import("@server/db/repositories/readModel"),
    import("@server/db/repositories/seasonSnapshot"),
    import("@server/engine/season"),
    import("@server/db/repositories/tagHolders"),
    import("@server/db/repositories/eventSources"),
  ]);

  runRefresh = pipeline.runRefresh;
  resetSingleFlight = pipeline.__resetSingleFlightForTests;
  listRuns = refreshRunsRepo.listRuns;
  getCurrentVersion = readModelRepo.getCurrentVersion;
  getPublished = readModelRepo.getPublished;
  loadSeasonSnapshot = seasonSnapshotRepo.loadSeasonSnapshot;
  computeSeason = engine.computeSeason;
  listHolders = tagHoldersRepo.listHolders;
  listSources = eventSourcesRepo.listSources;
  updateSource = eventSourcesRepo.updateSource;
  insertHolder = tagHoldersRepo.insertHolder;

  applyMigrations();
  seed();

  for (const source of listSources(SEASON_YEAR)) {
    if (source.type === "MID" || source.type === "LATE") {
      updateSource(source.id, { active: false });
    }
  }

  insertHolder({
    seasonYear: SEASON_YEAR,
    name: "Anthony D'Aiuto",
    tagNumber: 7,
    pool: "A",
    entryDate: "2026-01-15T00:00:00.000Z",
    pdgaNumber: FIXTURE_PDGA_NUMBER,
    ratingAtEntry: 952,
    pdgaMembership: true,
  });
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

function expectPublishedMatchesOracle(viewKey: string, pool: "A" | "B") {
  const view = getPublished(SEASON_YEAR, viewKey);
  expect(view).toBeDefined();
  const published = view!.payload as StandingsViewPayload;
  const snapshot = loadSeasonSnapshot(SEASON_YEAR);
  const expected = computeSeason(snapshot);
  const standing = expected.championship[pool];
  const nameById = new Map(listHolders(SEASON_YEAR).map((h) => [h.id, h.name]));

  expect(published.rows.length).toBeGreaterThan(0);
  expect(published.rows.length).toBe(standing.length);
  published.rows.forEach((row, i) => {
    const exp = standing[i]!;
    expect(row.rank).toBe(exp.rank);
    expect(row.playerId).toBe(exp.holderId);
    expect(row.tagNumber).toBe(exp.tagNumber);
    expect(row.points).toBe(exp.totalPoints);
    expect(row.pool).toBe(exp.pool);
    expect(row.tieBrokenByTag).toBe(exp.tieBrokenByTag);
    expect(row.name).toBe(nameById.get(exp.holderId));
    expect(row.rank).toBe(i + 1);
  });

  expect(typeof published.updatedAt).toBe("string");
  expect(published.stale).toBe(false);
  expect(published.pendingReview).toBeGreaterThanOrEqual(0);
  expect(published.finalized).toBeUndefined();
}

describe("runRefresh pipeline: fixture source -> published read model", () => {
  it("records a succeeded refresh_runs row and publishes oracle-matched standings", async () => {
    resetSingleFlight();
    const versionBefore = getCurrentVersion(SEASON_YEAR) ?? 0;

    const summary = await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    expect(summary.outcome).toBe("completed");
    expect(summary.status).toBe("succeeded");
    expect(summary.publishedVersion).toBeGreaterThan(versionBefore);

    const earlyOutcome = summary.sources.find((s) => s.pdgaEventId === "104527");
    expect(earlyOutcome?.status).toBe("ok");
    expect(earlyOutcome?.roundsPersisted).toBe(7);

    const runs = listRuns(SEASON_YEAR, 5);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0]?.status).toBe("succeeded");

    const currentVersion = getCurrentVersion(SEASON_YEAR);
    expect(currentVersion).toBeGreaterThanOrEqual(1);

    expectPublishedMatchesOracle("championship/pool-a", "A");
    expectPublishedMatchesOracle("championship/pool-b", "B");
  });

  it("single-flights two overlapping calls into exactly one new refresh_runs row", async () => {
    resetSingleFlight();
    const runCountBefore = listRuns(SEASON_YEAR, 1000).length;

    const [first, second] = await Promise.all([
      runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR }),
      runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR }),
    ]);

    const runCountAfter = listRuns(SEASON_YEAR, 1000).length;
    expect(runCountAfter - runCountBefore).toBe(1);

    expect(first.runId).toBe(second.runId);
    expect([first.outcome, second.outcome].sort()).toEqual(["completed", "skipped"]);
  });
});
