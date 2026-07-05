// Public UI shell tests (plans/common-a/05-ui-shell.md "Tests").
// No React renderer — vitest runs with the `react-server` condition (for
// `server-only` resolution), which blocks `react-dom/server`. We verify
// read-model payloads, client-safe helpers, and that placeholder route
// modules exist on disk.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { formatEt } from "@/lib";
import {
  isValidSubLeague,
  placeholderRouteHrefs,
  publicNavItems,
} from "@/lib/public-routes";
import type { PublicStandingsViewPayload } from "@/lib/standings-view";

const SEASON_YEAR = 2026;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

let tempDir: string;
let buildAndPublish: (seasonYear: number) => number;
let getPublished: (
  seasonYear: number,
  viewKey: string,
) => { payload: unknown } | undefined;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-vitest-shell-"));
  process.env.DATA_DIR = tempDir;

  const [{ applyMigrations }, { seed }, readmodel, readModelRepo] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/readmodel"),
    import("@server/db/repositories/readModel"),
  ]);

  buildAndPublish = readmodel.buildAndPublish;
  getPublished = readModelRepo.getPublished;

  applyMigrations();
  seed();
  buildAndPublish(SEASON_YEAR);
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

/** Mirrors StandingsView's pre-season zero-roster branch without rendering. */
function isZeroRosterDisplay(payload: PublicStandingsViewPayload): boolean {
  return payload.rows.length > 0 && payload.rows.every((row) => row.points === 0);
}

describe("public UI shell", () => {
  it("seeded championship payload supports shell rendering (standings, Updated … ET)", () => {
    const published = getPublished(SEASON_YEAR, "championship/pool-a");
    expect(published).toBeDefined();

    const payload = published!.payload as PublicStandingsViewPayload;

    expect(payload.rows.length).toBeGreaterThan(0);
    expect(payload.rows[0]).toMatchObject({
      rank: 1,
      name: expect.any(String),
      tagNumber: expect.any(Number),
      points: expect.any(Number),
    });
    expect(typeof payload.updatedAt).toBe("string");
    expect(formatEt(payload.updatedAt)).toMatch(/ ET$/);

    const nav = publicNavItems(SEASON_YEAR);
    expect(nav.some((item) => item.label === "Leaderboards")).toBe(true);
    expect(nav.some((item) => item.href === `/${SEASON_YEAR}/championship/pool-a`)).toBe(
      true,
    );
  });

  it("pre-season roster-at-zero is a valid display state, not an error", () => {
    const payload: PublicStandingsViewPayload = {
      rows: [
        {
          rank: 1,
          playerId: 1,
          name: "Alex Alpha",
          tagNumber: 12,
          points: 0,
          pool: "A",
          tieBrokenByTag: false,
        },
        {
          rank: 2,
          playerId: 2,
          name: "Blake Beta",
          tagNumber: 34,
          points: 0,
          pool: "A",
          tieBrokenByTag: false,
        },
      ],
      updatedAt: "2026-01-15T12:00:00.000Z",
      stale: false,
      pendingReview: 0,
    };

    expect(isZeroRosterDisplay(payload)).toBe(true);
    expect(payload.rows.every((row) => row.points === 0)).toBe(true);
    expect(formatEt(payload.updatedAt)).toContain("ET");
  });

  it("placeholder routes resolve (modules on disk) and are reachable from nav", () => {
    const navHrefs = new Set(publicNavItems(SEASON_YEAR).map((item) => item.href));
    const routeFiles: Record<string, string> = {
      [`/${SEASON_YEAR}/score-sheet/pool-a`]:
        "src/app/(public)/[season]/score-sheet/[pool]/page.tsx",
      [`/${SEASON_YEAR}/score-sheet/pool-b`]:
        "src/app/(public)/[season]/score-sheet/[pool]/page.tsx",
      [`/${SEASON_YEAR}/financials`]: "src/app/(public)/[season]/financials/page.tsx",
      [`/${SEASON_YEAR}/players/search`]: "src/app/(public)/[season]/players/[slug]/page.tsx",
    };

    for (const href of placeholderRouteHrefs(SEASON_YEAR)) {
      expect(routeFiles[href]).toBeDefined();
      expect(fs.existsSync(path.join(REPO_ROOT, routeFiles[href]!))).toBe(true);
    }

    for (const href of placeholderRouteHrefs(SEASON_YEAR)) {
      expect(navHrefs.has(href) || href.includes("/score-sheet/")).toBe(true);
    }

    expect(
      fs.existsSync(path.join(REPO_ROOT, "src/app/(public)/[season]/rounds/page.tsx")),
    ).toBe(true);
    expect(navHrefs.has(`/${SEASON_YEAR}/rounds`)).toBe(true);
    expect(navHrefs.has(`/${SEASON_YEAR}/financials`)).toBe(true);
    expect(navHrefs.has(`/${SEASON_YEAR}/players/search`)).toBe(true);
  });

  it("OLP routes (real pages, not placeholders) resolve and the alias is reachable from nav", () => {
    const navHrefs = new Set(publicNavItems(SEASON_YEAR).map((item) => item.href));

    // The nav OLP item now points at the bare `/olp` alias, not a specific league.
    expect(navHrefs.has(`/${SEASON_YEAR}/olp`)).toBe(true);
    expect(navHrefs.has(`/${SEASON_YEAR}/olp/mid`)).toBe(false);

    // Neither is a placeholder anymore — both are real pages, so they must
    // NOT appear in the placeholder-route list.
    const placeholders = placeholderRouteHrefs(SEASON_YEAR);
    expect(placeholders.some((href) => href.startsWith(`/${SEASON_YEAR}/olp`))).toBe(false);

    expect(
      fs.existsSync(path.join(REPO_ROOT, "src/app/(public)/[season]/olp/page.tsx")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(REPO_ROOT, "src/app/(public)/[season]/olp/[league]/page.tsx")),
    ).toBe(true);

    // The three explicit `/olp/<league>` deep links: valid slugs whose
    // published view actually resolves (the strongest available proxy for
    // "200, not 404" without a jsdom/route harness in this repo).
    for (const league of ["early", "mid", "late"] as const) {
      expect(isValidSubLeague(league)).toBe(true);
      const published = getPublished(SEASON_YEAR, `olp/${league}`);
      expect(published).toBeDefined();
    }
  });
});
