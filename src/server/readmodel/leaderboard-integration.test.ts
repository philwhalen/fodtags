// Chunk-05 closeout integration tests (plans/leaderboards/05-integration.md).
//
// Chunks 01-04 already thoroughly unit-test each pure helper in isolation
// (current-sub-league.test.ts, alias-target.test.ts, leaderboard-links.test.ts,
// filter-rows.test.ts) and build.test.ts already asserts the Championship
// views' rank/shape. What isn't covered anywhere yet is the **composition**
// Spec 04 §4.3/§4.6 actually relies on: a sub-league standings payload's
// shape at a *resolved* current sub-league, and the toggle control's href
// built from the real `getCurrentSubLeagueSlug` output (not a hardcoded
// slug) for both the gap-date and pre-season cases named in the Acceptance
// criteria. This file closes that gap.
//
// Same dynamic-import pattern as build.test.ts / currentSubLeague.test.ts:
// `@server/config` freezes `process.env` at first import, so `DATA_DIR`
// must be set before any server module loads. `@/lib` (pure, client-safe)
// is imported statically since it has no such dependency.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildLeaderboardLinks } from "@/lib";
import type { LeaderboardView } from "@/lib";
import type { SubLeagueSlug } from "@/lib/public-routes";
import type { StandingsViewPayload } from "@server/readmodel/build";

const SEASON_YEAR = 2026;

let tempDir: string;
let buildAndPublish: (seasonYear: number) => number;
let getPublished: (
  seasonYear: number,
  viewKey: string,
) => { payload: unknown } | undefined;
let getCurrentSubLeagueSlug: (seasonYear: number) => SubLeagueSlug | null;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-vitest-lb-integration-"));
  process.env.DATA_DIR = tempDir;

  const [{ applyMigrations }, { seed }, readmodel, readModelRepo, currentSubLeague] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/readmodel"),
    import("@server/db/repositories/readModel"),
    import("@server/readmodel/currentSubLeague"),
  ]);

  buildAndPublish = readmodel.buildAndPublish;
  getPublished = readModelRepo.getPublished;
  getCurrentSubLeagueSlug = currentSubLeague.getCurrentSubLeagueSlug;

  applyMigrations();
  seed();
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Leaderboards integration (Spec 04 acceptance criteria, chunk 05)", () => {
  it("sub-league/<current>/pool-b is ranked/shaped correctly, where <current> is resolved from the published meta view for the gap date 2026-07-04 (Spec 04 §4.3)", () => {
    // Seed windows (src/server/db/seed.ts): EARLY 2026-04-01..2026-05-13
    // (complete), MID 2026-05-20..2026-07-01, LATE 2026-07-08..2026-08-26.
    // 2026-07-04 falls in the gap after MID ends and before LATE starts, so
    // current resolves to the just-ended sub-league: MID.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00-04:00"));

    buildAndPublish(SEASON_YEAR);

    const slug = getCurrentSubLeagueSlug(SEASON_YEAR);
    expect(slug).toBe("mid");

    const view = getPublished(SEASON_YEAR, `sub-league/${slug}/pool-b`);
    expect(view).toBeDefined();
    const payload = view!.payload as StandingsViewPayload;

    // Same shape contract build.test.ts already asserts for Championship
    // views (contiguous rank, correct pool, boolean tie-break flag, weakly
    // descending points) — asserted here for a *sub-league* view reached via
    // the resolved "current" slug rather than a hardcoded one.
    payload.rows.forEach((row, i) => {
      expect(row.rank).toBe(i + 1);
      expect(row.pool).toBe("B");
      expect(typeof row.tieBrokenByTag).toBe("boolean");
      if (i > 0) {
        expect(payload.rows[i - 1]!.points).toBeGreaterThanOrEqual(row.points);
      }
    });

    // MID is seeded not yet marked complete (Spec 04 §4.3: League-Night
    // points only, Podium bonus not yet finalized).
    expect(payload.finalized).toBe(false);
  });

  it("composes getCurrentSubLeagueSlug + buildLeaderboardLinks end-to-end: from Championship · Pool B, the current sub-league option (marked '(now)') resolves to the gap date's sub-league (mid), pool preserved", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00-04:00"));

    buildAndPublish(SEASON_YEAR);

    const slug = getCurrentSubLeagueSlug(SEASON_YEAR);
    expect(slug).toBe("mid");

    // Composed from the real resolver output (not hardcoded "mid") — this is
    // exactly what `ChampionshipPage` does when it renders
    // `<LeaderboardControls>` (src/app/(public)/[season]/championship/[pool]/page.tsx):
    // the current sub-league drives which option shows "(now)", and its href
    // is the direct picker link for that slug.
    const currentSlug: SubLeagueSlug = slug ?? "early";
    const view: LeaderboardView = { seasonYear: SEASON_YEAR, scope: "championship", pool: "pool-b" };
    const links = buildLeaderboardLinks(view);

    expect(links.subLeaguePickerHrefs[currentSlug]).toBe(`/${SEASON_YEAR}/sub-league/mid/pool-b`);
  });

  it("pre-season fixed date (2026-01-01) resolves current to early and the composed current-sub-league option href follows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00-05:00"));

    buildAndPublish(SEASON_YEAR);

    const slug = getCurrentSubLeagueSlug(SEASON_YEAR);
    expect(slug).toBe("early");

    const currentSlug: SubLeagueSlug = slug ?? "early";
    const view: LeaderboardView = { seasonYear: SEASON_YEAR, scope: "championship", pool: "pool-a" };
    const links = buildLeaderboardLinks(view);

    expect(links.subLeaguePickerHrefs[currentSlug]).toBe(`/${SEASON_YEAR}/sub-league/early/pool-a`);
  });
});
