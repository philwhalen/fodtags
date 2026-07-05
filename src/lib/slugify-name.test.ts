// Move-only tests for the shared profile slug helper (Spec 08).
import { describe, expect, it } from "vitest";

import { slugifyName } from "./slugify-name";

describe("slugifyName", () => {
  it("lowercases and hyphenates non-alphanumeric runs", () => {
    expect(slugifyName("John Doe")).toBe("john-doe");
  });

  it("trims leading/trailing whitespace and hyphens", () => {
    expect(slugifyName("  --Alice Smith--  ")).toBe("alice-smith");
  });

  it("strips punctuation", () => {
    expect(slugifyName("O'Brien, Jr.")).toBe("o-brien-jr");
  });
});
