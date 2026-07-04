// Read-model build + publish tests (plans/common-a/04-readmodel.md "Tests"):
// the seed fixture -> `buildAndPublish` -> `getPublished` returns correct
// non-zero standings for both pools and a sub-league (with tie-break flags
// and freshness metadata); a forced mid-transaction failure leaves the
// published pointer unmoved (atomicity); and a second publish bumps the
// version.
//
// Same dynamic-import pattern as src/server/ingestion/pipeline.test.ts (see
// that file's header): `@server/config` freezes `process.env` at first
// import, so `DATA_DIR` must be set before any server module loads.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StandingsViewPayload, ViewRow } from "@server/readmodel/build";

const SEASON_YEAR = 2026;

let tempDir: string;
let buildViews: (seasonYear: number) => ViewRow[];
let publish: (seasonYear: number, views: ViewRow[]) => number;
let buildAndPublish: (seasonYear: number) => number;
let getCurrentVersion: (seasonYear: number) => number | undefined;
let getPublished: (
  seasonYear: number,
  viewKey: string,
) => { payload: unknown } | undefined;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-vitest-readmodel-"));
  process.env.DATA_DIR = tempDir;

  const [{ applyMigrations }, { seed }, readmodel, readModelRepo] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/readmodel"),
    import("@server/db/repositories/readModel"),
  ]);

  buildViews = readmodel.buildViews;
  publish = readmodel.publish;
  buildAndPublish = readmodel.buildAndPublish;
  getCurrentVersion = readModelRepo.getCurrentVersion;
  getPublished = readModelRepo.getPublished;

  applyMigrations();
  seed();
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

describe("read model: build -> publish -> read", () => {
  it("publishes Championship + sub-league standings from the seed fixture", () => {
    const version = buildAndPublish(SEASON_YEAR);
    expect(version).toBeGreaterThanOrEqual(1);
    expect(getCurrentVersion(SEASON_YEAR)).toBe(version);

    for (const pool of ["a", "b"] as const) {
      const view = getPublished(SEASON_YEAR, `championship/pool-${pool}`);
      expect(view).toBeDefined();
      const payload = view!.payload as StandingsViewPayload;

      // Non-empty, contiguously ranked 1..n, and points weakly descending
      // (Spec 04 §4.2 ordering — the engine's own fixtures pin exact totals).
      expect(payload.rows.length).toBeGreaterThan(0);
      payload.rows.forEach((row, i) => {
        expect(row.rank).toBe(i + 1);
        expect(row.pool).toBe(pool.toUpperCase());
        expect(typeof row.tieBrokenByTag).toBe("boolean");
        if (i > 0) {
          expect(payload.rows[i - 1]!.points).toBeGreaterThanOrEqual(row.points);
        }
      });

      // Freshness metadata is stamped here, not in the pure engine.
      expect(typeof payload.updatedAt).toBe("string");
      expect(payload.stale).toBe(false);
      expect(payload.pendingReview).toBe(0);
      // Championship views carry no `finalized` (sub-league-only) flag.
      expect(payload.finalized).toBeUndefined();
    }

    // Real computation happened somewhere in Pool A (EARLY is seeded
    // complete with results, so its Podium is folded in).
    const poolA = getPublished(SEASON_YEAR, "championship/pool-a")!
      .payload as StandingsViewPayload;
    expect(poolA.rows.some((row) => row.points > 0)).toBe(true);
  });

  it("marks a completed sub-league's standings finalized", () => {
    // EARLY is seeded `complete: true`; MID is not (see src/server/db/seed.ts).
    const early = getPublished(SEASON_YEAR, "sub-league/early/pool-a");
    expect(early).toBeDefined();
    expect((early!.payload as StandingsViewPayload).finalized).toBe(true);

    const mid = getPublished(SEASON_YEAR, "sub-league/mid/pool-a");
    expect(mid).toBeDefined();
    expect((mid!.payload as StandingsViewPayload).finalized).toBe(false);
  });

  it("leaves the published pointer unmoved when a publish throws mid-transaction", () => {
    const versionBefore = getCurrentVersion(SEASON_YEAR);
    expect(versionBefore).toBeDefined();
    const poolABefore = getPublished(SEASON_YEAR, "championship/pool-a");
    expect(poolABefore).toBeDefined();

    // A duplicated view row collides with the read_model unique index
    // `(seasonYear, version, viewKey)` on its second insert — throwing
    // partway through the single publish transaction.
    const views = buildViews(SEASON_YEAR);
    expect(() => publish(SEASON_YEAR, [...views, views[0]!])).toThrow();

    // The pointer never advanced and the live view is byte-for-byte the
    // pre-failure payload — readers never saw the partial write.
    expect(getCurrentVersion(SEASON_YEAR)).toBe(versionBefore);
    expect(getPublished(SEASON_YEAR, "championship/pool-a")).toEqual(poolABefore);
  });

  it("bumps the version on a second publish", () => {
    const before = getCurrentVersion(SEASON_YEAR)!;
    const next = buildAndPublish(SEASON_YEAR);
    expect(next).toBe(before + 1);
    expect(getCurrentVersion(SEASON_YEAR)).toBe(next);
  });
});
