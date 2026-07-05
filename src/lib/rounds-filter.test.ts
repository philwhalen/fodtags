// Pure unit tests for Rounds filter parse/serialize/link builder (Spec 05 §5.4/§5.7).
import { describe, expect, it } from "vitest";

import {
  buildRoundsLinks,
  parseRoundsFilter,
  serializeRoundsFilter,
} from "./rounds-filter";
import type { RoundTypeCode } from "./rounds-types";

describe("parseRoundsFilter", () => {
  it("defaults empty params to All leagues and League Night only", () => {
    expect(parseRoundsFilter({})).toEqual({ league: null, types: ["ln"] });
  });

  it("drops invalid league values", () => {
    expect(parseRoundsFilter({ league: "bogus" })).toEqual({
      league: null,
      types: ["ln"],
    });
  });

  it("accepts a valid sub-league slug", () => {
    expect(parseRoundsFilter({ league: "mid" })).toEqual({
      league: "mid",
      types: ["ln"],
    });
  });

  it("parses and dedupes valid type codes, always keeping ln", () => {
    expect(parseRoundsFilter({ types: "tournament,ln,fodopen,tournament" })).toEqual({
      league: null,
      types: ["ln", "tournament", "fodopen"],
    });
  });

  it("falls back to ln when types param has no valid codes", () => {
    expect(parseRoundsFilter({ types: "bogus,also-bogus" })).toEqual({
      league: null,
      types: ["ln"],
    });
  });

  it("forces types to ln when a sub-league is selected", () => {
    expect(
      parseRoundsFilter({ league: "early", types: "tournament,fodopen" }),
    ).toEqual({ league: "early", types: ["ln"] });
  });

  it("always includes ln even when omitted from types", () => {
    expect(parseRoundsFilter({ types: "tournament" })).toEqual({
      league: null,
      types: ["ln", "tournament"],
    });
  });
});

describe("serializeRoundsFilter", () => {
  it("omits both params for the default filter (bare /rounds URL)", () => {
    expect(serializeRoundsFilter({ league: null, types: ["ln"] })).toEqual({});
  });

  it("includes league when set", () => {
    expect(serializeRoundsFilter({ league: "late", types: ["ln"] })).toEqual({
      league: "late",
    });
  });

  it("includes types when more than ln alone", () => {
    expect(
      serializeRoundsFilter({ league: null, types: ["ln", "tournament", "fodopen"] }),
    ).toEqual({ types: "ln,tournament,fodopen" });
  });

  it("round-trips through parse", () => {
    const filter = { league: null, types: ["ln", "tournament"] as RoundTypeCode[] };
    const serialized = serializeRoundsFilter(filter);
    expect(parseRoundsFilter(serialized)).toEqual(filter);
  });

  it("round-trips a league-scoped filter", () => {
    const filter = { league: "mid" as const, types: ["ln"] as RoundTypeCode[] };
    const serialized = serializeRoundsFilter(filter);
    expect(parseRoundsFilter(serialized)).toEqual(filter);
  });
});

describe("buildRoundsLinks", () => {
  it("subLeagueHref(null) preserves non-default types", () => {
    const links = buildRoundsLinks(2026, { league: "early", types: ["ln"] });
    expect(links.subLeagueHref(null)).toBe("/2026/rounds");
  });

  it("subLeagueHref selects a sub-league with canonical ln-only params", () => {
    const links = buildRoundsLinks(2026, {
      league: null,
      types: ["ln", "tournament"],
    });
    expect(links.subLeagueHref("mid")).toBe("/2026/rounds?league=mid");
  });

  it("typeToggleHref adds tournament when absent", () => {
    const links = buildRoundsLinks(2026, { league: null, types: ["ln"] });
    expect(links.typeToggleHref("tournament")).toBe("/2026/rounds?types=ln%2Ctournament");
  });

  it("typeToggleHref removes tournament when present", () => {
    const links = buildRoundsLinks(2026, {
      league: null,
      types: ["ln", "tournament", "fodopen"],
    });
    expect(links.typeToggleHref("tournament")).toBe("/2026/rounds?types=ln%2Cfodopen");
  });

  it("typeToggleHref clears league and toggles from a league-scoped view", () => {
    const links = buildRoundsLinks(2026, { league: "early", types: ["ln"] });
    expect(links.typeToggleHref("fodopen")).toBe("/2026/rounds?types=ln%2Cfodopen");
  });

  it("typeToggleHref for ln is a no-op", () => {
    const filter = { league: null, types: ["ln", "tournament"] as RoundTypeCode[] };
    const links = buildRoundsLinks(2026, filter);
    expect(links.typeToggleHref("ln")).toBe("/2026/rounds?types=ln%2Ctournament");
  });
});
