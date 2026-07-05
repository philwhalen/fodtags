import { describe, expect, it } from "vitest";

import { resolveCurrentSubLeague, type SubLeagueWindow } from "./current-sub-league";

// Mirrors the seed windows (src/server/db/seed.ts): EARLY complete
// 2026-04-01..2026-05-13; MID 2026-05-20..2026-07-01; LATE 2026-07-08..2026-08-26.
const EARLY: SubLeagueWindow = {
  type: "EARLY",
  startDate: "2026-04-01",
  endDate: "2026-05-13",
  complete: true,
};
const MID: SubLeagueWindow = {
  type: "MID",
  startDate: "2026-05-20",
  endDate: "2026-07-01",
  complete: false,
};
const LATE: SubLeagueWindow = {
  type: "LATE",
  startDate: "2026-07-08",
  endDate: "2026-08-26",
  complete: false,
};

const ALL: SubLeagueWindow[] = [EARLY, MID, LATE];

describe("resolveCurrentSubLeague", () => {
  it("resolves to the sub-league whose window contains today", () => {
    expect(resolveCurrentSubLeague(ALL, "2026-06-15")).toBe("MID");
  });

  it("resolves to the most-recently-ended sub-league in the gap between windows", () => {
    // Between MID.endDate (2026-07-01) and LATE.startDate (2026-07-08) — no
    // window contains today (Spec 04 §4.3's gap-handling branch).
    expect(resolveCurrentSubLeague(ALL, "2026-07-04")).toBe("MID");
  });

  it("resolves to the most-recently-ended sub-league after all windows have ended", () => {
    expect(resolveCurrentSubLeague(ALL, "2026-09-01")).toBe("LATE");
  });

  it("resolves to the earliest sub-league before any window has started (pre-season)", () => {
    expect(resolveCurrentSubLeague(ALL, "2026-01-01")).toBe("EARLY");
  });

  it("ignores sub-leagues with no configured window", () => {
    const undated: SubLeagueWindow = { type: "LATE", startDate: null, endDate: null, complete: false };
    expect(resolveCurrentSubLeague([EARLY, MID, undated], "2026-09-01")).toBe("MID");
  });

  it("ignores a sub-league with only one date configured", () => {
    const halfDated: SubLeagueWindow = { type: "LATE", startDate: "2026-07-08", endDate: null, complete: false };
    expect(resolveCurrentSubLeague([EARLY, MID, halfDated], "2026-09-01")).toBe("MID");
  });

  it("returns null when no sub-league has a configured window", () => {
    const noneDated: SubLeagueWindow[] = [
      { type: "EARLY", startDate: null, endDate: null, complete: false },
      { type: "MID", startDate: null, endDate: null, complete: false },
      { type: "LATE", startDate: null, endDate: null, complete: false },
    ];
    expect(resolveCurrentSubLeague(noneDated, "2026-06-15")).toBeNull();
  });

  it("boundary: today exactly on a window's startDate is in-window", () => {
    expect(resolveCurrentSubLeague(ALL, "2026-05-20")).toBe("MID");
  });

  it("boundary: today exactly on a window's endDate is in-window", () => {
    expect(resolveCurrentSubLeague(ALL, "2026-07-01")).toBe("MID");
  });
});
