// Pure unit tests for the leaderboard view-control link builder
// (Spec 04 §4.1/§4.6; plans/leaderboards/03-toggle-controls.md).
import { describe, expect, it } from "vitest";

import { buildLeaderboardLinks } from "./leaderboard-links";
import type { LeaderboardView } from "./leaderboard-links";

describe("buildLeaderboardLinks", () => {
  it("from championship/pool-b: each sub-league option is directly reachable, pool preserved", () => {
    const view: LeaderboardView = { seasonYear: 2026, scope: "championship", pool: "pool-b" };
    const links = buildLeaderboardLinks(view);
    expect(links.subLeaguePickerHrefs.mid).toBe("/2026/sub-league/mid/pool-b");
  });

  it("from sub-league/mid/pool-b: championshipHref preserves pool", () => {
    const view: LeaderboardView = {
      seasonYear: 2026,
      scope: "sub-league",
      pool: "pool-b",
      subLeague: "mid",
    };
    const links = buildLeaderboardLinks(view);
    expect(links.championshipHref).toBe("/2026/championship/pool-b");
  });

  it("from sub-league/mid/pool-b: poolAHref preserves the current sub-league", () => {
    const view: LeaderboardView = {
      seasonYear: 2026,
      scope: "sub-league",
      pool: "pool-b",
      subLeague: "mid",
    };
    const links = buildLeaderboardLinks(view);
    expect(links.poolAHref).toBe("/2026/sub-league/mid/pool-a");
  });

  it("from sub-league/mid/pool-b: picker href for late preserves pool", () => {
    const view: LeaderboardView = {
      seasonYear: 2026,
      scope: "sub-league",
      pool: "pool-b",
      subLeague: "mid",
    };
    const links = buildLeaderboardLinks(view);
    expect(links.subLeaguePickerHrefs.late).toBe("/2026/sub-league/late/pool-b");
  });

  it("championshipHref always targets the current pool explicitly regardless of scope", () => {
    const view: LeaderboardView = { seasonYear: 2026, scope: "championship", pool: "pool-a" };
    const links = buildLeaderboardLinks(view);
    expect(links.championshipHref).toBe("/2026/championship/pool-a");
    expect(links.poolAHref).toBe("/2026/championship/pool-a");
    expect(links.poolBHref).toBe("/2026/championship/pool-b");
  });

  it("subLeaguePickerHrefs contains all three sub-leagues, preserving pool", () => {
    const view: LeaderboardView = {
      seasonYear: 2026,
      scope: "sub-league",
      pool: "pool-a",
      subLeague: "early",
    };
    const links = buildLeaderboardLinks(view);
    expect(links.subLeaguePickerHrefs).toEqual({
      early: "/2026/sub-league/early/pool-a",
      mid: "/2026/sub-league/mid/pool-a",
      late: "/2026/sub-league/late/pool-a",
    });
  });
});
