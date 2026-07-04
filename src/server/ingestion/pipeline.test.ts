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

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-vitest-"));
  process.env.DATA_DIR = tempDir;

  const [{ applyMigrations }, { seed }, pipeline, refreshRunsRepo, readModelRepo] =
    await Promise.all([
      import("@server/db/migrate"),
      import("@server/db/seed"),
      import("@server/ingestion/pipeline"),
      import("@server/db/repositories/refreshRuns"),
      import("@server/db/repositories/readModel"),
    ]);

  runRefresh = pipeline.runRefresh;
  resetSingleFlight = pipeline.__resetSingleFlightForTests;
  listRuns = refreshRunsRepo.listRuns;
  getCurrentVersion = readModelRepo.getCurrentVersion;
  getPublished = readModelRepo.getPublished;

  // Boot steps 2-3 (specs/12-Architecture.md §12.13), run directly against
  // the fresh temp DATA_DIR rather than via the whole Next.js boot.
  applyMigrations();
  seed();
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

describe("runRefresh pipeline: stub source -> published read model", () => {
  it("records a succeeded refresh_runs row and publishes a new read-model version at 0 points", async () => {
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

    const payload = poolA!.payload as { rows: Array<{ points: number; tagNumber: number }> };
    // Seeded roster has Pool A holders (Alex Rivera / Jordan Lee / Sam
    // Patel, see src/server/db/seed.ts) — the empty pre-season roster,
    // every row at 0 points (Spec 04 §4.4).
    expect(payload.rows.length).toBeGreaterThan(0);
    expect(payload.rows.every((row) => row.points === 0)).toBe(true);
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
