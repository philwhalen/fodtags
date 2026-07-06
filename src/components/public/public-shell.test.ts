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
import { authControlModel } from "@/lib/auth-control";
import {
  isValidPool,
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
          slug: "alex-alpha",
          tagNumber: 12,
          points: 0,
          pool: "A",
          tieBrokenByTag: false,
        },
        {
          rank: 2,
          playerId: 2,
          name: "Blake Beta",
          slug: "blake-beta",
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

  it("placeholder list is empty once all nav targets are real pages", () => {
    expect(placeholderRouteHrefs(SEASON_YEAR)).toEqual([]);
  });

  it("Players routes (real pages) resolve and are reachable from nav", () => {
    const navHrefs = new Set(publicNavItems(SEASON_YEAR).map((item) => item.href));

    expect(navHrefs.has(`/${SEASON_YEAR}/players`)).toBe(true);
    expect(placeholderRouteHrefs(SEASON_YEAR).some((href) => href.includes("/players"))).toBe(
      false,
    );

    expect(
      fs.existsSync(path.join(REPO_ROOT, "src/app/(public)/[season]/players/page.tsx")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(REPO_ROOT, "src/app/(public)/[season]/players/[slug]/page.tsx")),
    ).toBe(true);

    const index = getPublished(SEASON_YEAR, "players");
    expect(index).toBeDefined();
    const holders = (index!.payload as { holders: { slug: string }[] }).holders;
    expect(holders.length).toBeGreaterThan(0);
    const sample = getPublished(SEASON_YEAR, `players/${holders[0]!.slug}`);
    expect(sample).toBeDefined();
  });

  it("admin auth control: signed out shows Admin login → /admin sign-in", () => {
    const model = authControlModel(null);
    expect(model.mode).toBe("signed-out");
    if (model.mode === "signed-out") {
      expect(model.loginLabel).toBe("Admin login");
      expect(model.loginHref).toContain("callbackUrl=/admin");
    }
  });

  it("admin auth control: director shows Admin panel + Logout", () => {
    const model = authControlModel({ user: { isDirector: true } });
    expect(model.mode).toBe("director");
    if (model.mode === "director") {
      expect(model.panelHref).toBe("/admin");
      expect(model.logoutLabel).toBe("Logout");
    }
  });

  it("AuthControl component exists and is mounted in the season header", () => {
    expect(
      fs.existsSync(path.join(REPO_ROOT, "src/components/public/AuthControl.tsx")),
    ).toBe(true);
    const layout = fs.readFileSync(
      path.join(REPO_ROOT, "src/app/(public)/[season]/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("AuthControl");
  });

  it("core public routes resolve on disk and are reachable from nav", () => {
    const navHrefs = new Set(publicNavItems(SEASON_YEAR).map((item) => item.href));

    expect(
      fs.existsSync(path.join(REPO_ROOT, "src/app/(public)/[season]/rounds/page.tsx")),
    ).toBe(true);
    expect(navHrefs.has(`/${SEASON_YEAR}/rounds`)).toBe(true);
  });

  it("Financials route (real page) resolves and is reachable from nav", () => {
    const navHrefs = new Set(publicNavItems(SEASON_YEAR).map((item) => item.href));

    // Nav still deep-links the financials page (unchanged href).
    expect(navHrefs.has(`/${SEASON_YEAR}/financials`)).toBe(true);

    // No longer a placeholder — must not appear in the placeholder list.
    const placeholders = placeholderRouteHrefs(SEASON_YEAR);
    expect(placeholders.some((href) => href.startsWith(`/${SEASON_YEAR}/financials`))).toBe(
      false,
    );

    expect(
      fs.existsSync(path.join(REPO_ROOT, "src/app/(public)/[season]/financials/page.tsx")),
    ).toBe(true);

    const published = getPublished(SEASON_YEAR, "financials");
    expect(published).toBeDefined();
  });

  it("Score-sheet routes (real pages, not placeholders) resolve and are reachable from nav", () => {
    const navHrefs = new Set(publicNavItems(SEASON_YEAR).map((item) => item.href));

    // Nav still deep-links the Pool A score sheet (unchanged href).
    expect(navHrefs.has(`/${SEASON_YEAR}/score-sheet/pool-a`)).toBe(true);

    // No longer placeholders — neither pool may appear in the placeholder list.
    const placeholders = placeholderRouteHrefs(SEASON_YEAR);
    expect(
      placeholders.some((href) => href.startsWith(`/${SEASON_YEAR}/score-sheet`)),
    ).toBe(false);

    expect(
      fs.existsSync(
        path.join(REPO_ROOT, "src/app/(public)/[season]/score-sheet/[pool]/page.tsx"),
      ),
    ).toBe(true);

    // Both pool deep links: valid slugs whose published view actually resolves
    // (the strongest available proxy for "200, not 404" without a jsdom/route
    // harness in this repo — same as the OLP/rounds checks).
    for (const pool of ["pool-a", "pool-b"] as const) {
      expect(isValidPool(pool)).toBe(true);
      const published = getPublished(SEASON_YEAR, `score-sheet/${pool}`);
      expect(published).toBeDefined();
    }
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
