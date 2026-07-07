import { describe, expect, it } from "vitest";

import { formatTagNumber, tagSortKey } from "./tag-number";

describe("tagSortKey", () => {
  it("orders numbered holders by ascending tag number", () => {
    expect(tagSortKey(5) - tagSortKey(12)).toBeLessThan(0);
  });

  it("sorts a null tag number after any numbered tag", () => {
    expect(tagSortKey(null) - tagSortKey(999999)).toBeGreaterThan(0);
  });

  it("gives equal keys for equal tag numbers (falls to a secondary comparator)", () => {
    expect(tagSortKey(7) - tagSortKey(7)).toBe(0);
  });

  it("gives equal keys for two null tag numbers (falls to a secondary comparator)", () => {
    expect(tagSortKey(null) - tagSortKey(null)).toBe(0);
  });
});

describe("formatTagNumber", () => {
  it("renders the tag number as a string", () => {
    expect(formatTagNumber(12)).toBe("12");
  });

  it("renders an em dash for a null tag number", () => {
    expect(formatTagNumber(null)).toBe("—");
  });
});
