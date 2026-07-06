import { describe, expect, it } from "vitest";

import { buildCanonicalSlugs, resolveHolderSlug } from "./holder-slug";

describe("buildCanonicalSlugs", () => {
  it("uses a bare name slug when names do not collide", () => {
    const slugs = buildCanonicalSlugs([
      { id: 1, name: "Jonathan Svendsen", tagNumber: 7 },
      { id: 2, name: "Casey Lee", tagNumber: 12 },
    ]);
    expect(slugs.get(1)).toBe("jonathan-svendsen");
    expect(slugs.get(2)).toBe("casey-lee");
  });

  it("appends tag numbers when base slugs collide", () => {
    const slugs = buildCanonicalSlugs([
      { id: 1, name: "Alex Smith", tagNumber: 12 },
      { id: 2, name: "Alex Smith", tagNumber: 47 },
    ]);
    expect(slugs.get(1)).toBe("alex-smith-12");
    expect(slugs.get(2)).toBe("alex-smith-47");
  });
});

describe("resolveHolderSlug", () => {
  const holders = [{ slug: "alex-smith-12" }, { slug: "alex-smith-47" }];

  it("returns found for an exact canonical slug", () => {
    expect(resolveHolderSlug("alex-smith-12", holders)).toEqual({
      kind: "found",
      slug: "alex-smith-12",
    });
  });

  it("redirects an unambiguous base slug to the suffixed canonical", () => {
    expect(resolveHolderSlug("alex-smith-12", [{ slug: "alex-smith-12" }])).toEqual({
      kind: "found",
      slug: "alex-smith-12",
    });
    expect(resolveHolderSlug("alex-smith", [{ slug: "alex-smith-12" }])).toEqual({
      kind: "redirect",
      slug: "alex-smith-12",
    });
  });

  it("returns not_found for ambiguous or unknown slugs", () => {
    expect(resolveHolderSlug("alex-smith", holders)).toEqual({ kind: "not_found" });
    expect(resolveHolderSlug("nobody", holders)).toEqual({ kind: "not_found" });
  });
});
