// Pure unit tests for the client-side name filter (Spec 04 §4.7;
// plans/leaderboards/04-name-filter.md).
import { describe, expect, it } from "vitest";

import { filterRowsByName } from "./filter-rows";

interface Row {
  name: string;
  rank: number;
  points: number;
}

const rows: Row[] = [
  { name: "John Doe", rank: 1, points: 100 },
  { name: "José Ramirez", rank: 2, points: 90 },
  { name: "Alice Smith", rank: 3, points: 80 },
];

describe("filterRowsByName", () => {
  it("empty query returns rows unchanged (identity: same length and order)", () => {
    const result = filterRowsByName(rows, "");
    expect(result).toBe(rows);
    expect(result.length).toBe(rows.length);
    expect(result.map((r) => r.name)).toEqual(rows.map((r) => r.name));
  });

  it("whitespace-only query returns rows unchanged (identity)", () => {
    const result = filterRowsByName(rows, "   ");
    expect(result).toBe(rows);
  });

  it("substring match is case-insensitive", () => {
    const result = filterRowsByName(rows, "DOE");
    expect(result.map((r) => r.name)).toEqual(["John Doe"]);
  });

  it("is accent-insensitive", () => {
    const result = filterRowsByName(rows, "jose");
    expect(result.map((r) => r.name)).toEqual(["José Ramirez"]);
  });

  it("no match returns an empty array", () => {
    const result = filterRowsByName(rows, "zzz-nomatch");
    expect(result).toEqual([]);
  });

  it("filtered rows retain their original rank/points (never re-ranked)", () => {
    const result = filterRowsByName(rows, "jose");
    expect(result[0]).toEqual({ name: "José Ramirez", rank: 2, points: 90 });
    expect(result[0]).toBe(rows[1]);
  });
});
