// `getCurrentSubLeagueSlug` tests (plans/leaderboards/02-alias-routes.md).
//
// No page/route-test harness exists in this repo yet (vitest.config.ts only
// collects `src/**/*.test.ts` — no jsdom/React environment is configured),
// so per the sub-plan's fallback this chunk thoroughly unit-tests the
// server-only resolver directly against a seeded + published read model
// rather than rendering the route files. The route files themselves
// (`src/app/(public)/[season]/sub-league/page.tsx` and `.../[league]/page.tsx`)
// are thin wrappers over this function plus the already pure-tested
// `resolveAliasTarget` — there is no additional branching logic left
// untested by covering this function and `alias-target.test.ts` together.
//
// Same dynamic-import pattern as src/server/readmodel/build.test.ts (see
// that file's header): `@server/config` freezes `process.env` at first
// import, so `DATA_DIR` must be set before any server module loads.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const SEASON_YEAR = 2026;

let tempDir: string;
let buildAndPublish: (seasonYear: number) => number;
let getCurrentSubLeagueSlug: (seasonYear: number) => string | null;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-vitest-currentsubleague-"));
  process.env.DATA_DIR = tempDir;

  const [{ applyMigrations }, { seed }, readmodel, currentSubLeague] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/readmodel"),
    import("@server/readmodel/currentSubLeague"),
  ]);

  buildAndPublish = readmodel.buildAndPublish;
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

describe("getCurrentSubLeagueSlug", () => {
  it("returns null before anything has been published for the season", () => {
    // Nothing published yet for this season in this fresh temp DB.
    expect(getCurrentSubLeagueSlug(SEASON_YEAR)).toBeNull();
  });

  it("resolves the gap between two sub-leagues to the just-ended one (Spec 04 §4.3)", () => {
    // Seed windows (src/server/db/seed.ts): EARLY 2026-04-01..2026-05-13
    // (complete), MID 2026-05-20..2026-07-01, LATE 2026-07-08..2026-08-26.
    // "Today" 2026-07-04 falls in the gap after MID ends and before LATE
    // starts, so current resolves to the most-recently-ended: MID.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00-04:00"));

    buildAndPublish(SEASON_YEAR);

    expect(getCurrentSubLeagueSlug(SEASON_YEAR)).toBe("mid");
  });

  it("resolves to the in-window sub-league when today falls inside one", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T12:00:00-04:00"));

    buildAndPublish(SEASON_YEAR);

    expect(getCurrentSubLeagueSlug(SEASON_YEAR)).toBe("late");
  });

  it("resolves to the earliest sub-league before the season begins", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00-05:00"));

    buildAndPublish(SEASON_YEAR);

    expect(getCurrentSubLeagueSlug(SEASON_YEAR)).toBe("early");
  });
});
