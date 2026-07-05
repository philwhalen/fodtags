// PdgaShapeError fails the whole run — no read-model version bump (sub-plan 08).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import type { RunRefreshInput, RunRefreshSummary } from "@server/ingestion/pipeline";
import { PdgaShapeError } from "@server/ingestion/pdga/schema";
import type { PdgaSource } from "@server/ingestion/pdga/source";

const SEASON_YEAR = 2026;

let tempDir: string;
let runRefresh: (input: RunRefreshInput) => Promise<RunRefreshSummary>;
let resetSingleFlight: () => void;
let setPdgaSource: (source: PdgaSource | null) => void;
let getCurrentVersion: (seasonYear: number) => number | undefined;
let getPublished: (
  seasonYear: number,
  viewKey: string,
) => { payload: unknown } | undefined;
let listRuns: (seasonYear: number, limit?: number) => Array<{ status: string }>;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-shape-error-"));
  process.env.DATA_DIR = tempDir;

  const [{ applyMigrations }, { seed }, pipeline, pdgaMod, readModelRepo, refreshRunsRepo] =
    await Promise.all([
      import("@server/db/migrate"),
      import("@server/db/seed"),
      import("@server/ingestion/pipeline"),
      import("@server/ingestion/pdga"),
      import("@server/db/repositories/readModel"),
      import("@server/db/repositories/refreshRuns"),
    ]);

  runRefresh = pipeline.runRefresh;
  resetSingleFlight = pipeline.__resetSingleFlightForTests;
  setPdgaSource = pdgaMod.__setPdgaSourceForTests;
  getCurrentVersion = readModelRepo.getCurrentVersion;
  getPublished = readModelRepo.getPublished;
  listRuns = refreshRunsRepo.listRuns;

  applyMigrations();
  seed();
});

afterAll(async () => {
  setPdgaSource(null);
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

describe("shape error: fail loud, publish nothing", () => {
  it("does not bump read-model version and leaves last published payload byte-identical", async () => {
    resetSingleFlight();
    setPdgaSource(null);

    const goodRun = await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });
    expect(goodRun.status).toBe("succeeded");

    const versionBefore = getCurrentVersion(SEASON_YEAR)!;
    const poolA = getPublished(SEASON_YEAR, "championship/pool-a")!;
    const poolBPayload = JSON.stringify(getPublished(SEASON_YEAR, "championship/pool-b")!.payload);
    const poolAPayload = JSON.stringify(poolA.payload);

    setPdgaSource({
      async fetchEvent() {
        const cause = z.object({ data: z.object({ Divisions: z.array(z.unknown()) }) }).safeParse({})
          .error!;
        throw new PdgaShapeError("104527", "live_results_fetch_event", cause);
      },
    });

    resetSingleFlight();
    const badRun = await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    expect(badRun.status).toBe("failed");
    expect(badRun.publishedVersion).toBeUndefined();
    expect(getCurrentVersion(SEASON_YEAR)).toBe(versionBefore);
    expect(JSON.stringify(getPublished(SEASON_YEAR, "championship/pool-a")!.payload)).toBe(
      poolAPayload,
    );
    expect(JSON.stringify(getPublished(SEASON_YEAR, "championship/pool-b")!.payload)).toBe(
      poolBPayload,
    );

    const [latestRun] = listRuns(SEASON_YEAR, 1);
    expect(latestRun?.status).toBe("failed");
  });
});
