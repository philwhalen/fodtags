// Pipeline integration test (CLAUDE.md "Testing priorities";
// specs/12-Architecture.md §12.11/§12.13): "stub source -> run -> published
// read model -> page renders empty roster", plus the single-flight guard.
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

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-vitest-"));
  process.env.DATA_DIR = tempDir;

  const [{ applyMigrations }, { seed }, pipeline, refreshRunsRepo, readModelRepo, seasonSnapshotRepo, engine, tagHoldersRepo] =
    await Promise.all([
      import("@server/db/migrate"),
      import("@server/db/seed"),
      import("@server/ingestion/pipeline"),
      import("@server/db/repositories/refreshRuns"),
      import("@server/db/repositories/readModel"),
      import("@server/db/repositories/seasonSnapshot"),
      import("@server/engine/season"),
      import("@server/db/repositories/tagHolders"),
    ]);

  runRefresh = pipeline.runRefresh;
  resetSingleFlight = pipeline.__resetSingleFlightForTests;
  listRuns = refreshRunsRepo.listRuns;
  getCurrentVersion = readModelRepo.getCurrentVersion;
  getPublished = readModelRepo.getPublished;
  loadSeasonSnapshot = seasonSnapshotRepo.loadSeasonSnapshot;
  computeSeason = engine.computeSeason;
  listHolders = tagHoldersRepo.listHolders;

  // Boot steps 2-3 (specs/12-Architecture.md §12.13), run directly against
  // the fresh temp DATA_DIR rather than via the whole Next.js boot.
  applyMigrations();
  seed();
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

describe("runRefresh pipeline: stub source -> published read model", () => {
  it("records a succeeded refresh_runs row and publishes computed standings", async () => {
    const versionBefore = getCurrentVersion(SEASON_YEAR) ?? 0;

    const summary = await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    expect(summary.outcome).toBe("completed");
    expect(summary.status).toBe("succeeded");
    expect(summary.publishedVersion).toBeGreaterThan(versionBefore);

    const runs = listRuns(SEASON_YEAR, 5);
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0]?.status).toBe("succeeded");

    const currentVersion = getCurrentVersion(SEASON_YEAR);
    expect(currentVersion).toBeGreaterThanOrEqual(1);

    const poolA = getPublished(SEASON_YEAR, "championship/pool-a");
    expect(poolA).toBeDefined();

    const payload = poolA!.payload as StandingsViewPayload;

    // The seed fixture drives real `computeSeason` output through the full
    // pipeline (snapshot loader → engine → read-model publish). Compare the
    // published Championship payload to a fresh engine run — the same contract
    // the championship page consumes via `getPublished` (Spec 04 §4.2).
    const snapshot = loadSeasonSnapshot(SEASON_YEAR);
    const expected = computeSeason(snapshot);
    const nameById = new Map(listHolders(SEASON_YEAR).map((h) => [h.id, h.name]));

    for (const pool of ["A", "B"] as const) {
      const view = getPublished(SEASON_YEAR, `championship/pool-${pool.toLowerCase()}`);
      expect(view).toBeDefined();
      const published = view!.payload as StandingsViewPayload;
      const standing = expected.championship[pool];

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
      expect(published.pendingReview).toBe(0);
      expect(published.finalized).toBeUndefined();
    }

    // Seed hand-check (EARLY complete, canceled night 3 excluded): Alex 450,
    // Jordan 220 in Pool A; Morgan 450 in Pool B.
    expect(payload.rows[0]).toMatchObject({ name: "Alex Rivera", tagNumber: 1, points: 450, rank: 1 });
    expect(payload.rows.some((row) => row.name === "Jordan Lee" && row.points === 220)).toBe(true);

    const poolB = getPublished(SEASON_YEAR, "championship/pool-b")!.payload as StandingsViewPayload;
    expect(poolB.rows[0]).toMatchObject({ name: "Morgan Kim", tagNumber: 5, points: 450, rank: 1 });
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

    // Both callers resolve to the SAME run: one path actually executed the
    // pipeline ("completed"), the other coalesced onto the in-flight
    // promise ("skipped") — see the single-flight guard in pipeline.ts.
    expect(first.runId).toBe(second.runId);
    expect([first.outcome, second.outcome].sort()).toEqual(["completed", "skipped"]);
  });
});
