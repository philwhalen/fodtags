// Pure unit tests for the `/sub-league` alias mapping (Spec 04 §4.5;
// plans/leaderboards/02-alias-routes.md).
import { describe, expect, it } from "vitest";

import { resolveAliasTarget } from "./alias-target";

describe("resolveAliasTarget", () => {
  it("maps a pool segment to the current sub-league, preserving the pool", () => {
    expect(resolveAliasTarget("2026", "pool-b", "mid")).toBe("/2026/sub-league/mid/pool-b");
  });

  it("maps a pool segment with a different current sub-league", () => {
    expect(resolveAliasTarget("2026", "pool-a", "late")).toBe("/2026/sub-league/late/pool-a");
  });

  it("maps a sub-league segment to that sub-league, defaulting to Pool A", () => {
    expect(resolveAliasTarget("2026", "mid", "late")).toBe("/2026/sub-league/mid/pool-a");
  });

  it("returns null for a segment that is neither a pool nor a sub-league slug", () => {
    expect(resolveAliasTarget("2026", "garbage", "mid")).toBeNull();
  });
});
