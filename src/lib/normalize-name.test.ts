import { describe, expect, it } from "vitest";

import { normalizeName } from "@/lib/normalize-name";

describe("normalizeName", () => {
  it("folds case, whitespace, punctuation, and diacritics", () => {
    expect(normalizeName("José  Peña-Ruiz")).toBe("jose pena ruiz");
  });

  it("trims and collapses internal whitespace", () => {
    expect(normalizeName("  Alice   Bob  ")).toBe("alice bob");
  });

  it("strips punctuation", () => {
    expect(normalizeName("O'Brien, Jr.")).toBe("o brien jr");
  });
});
