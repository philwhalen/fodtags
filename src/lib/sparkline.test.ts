// Pure unit tests for sparkline geometry (Spec 05 §5.5).
import { describe, expect, it } from "vitest";

import { sparklinePath, sparklineSummary } from "./sparkline";

describe("sparklinePath", () => {
  it("returns empty string for fewer than two points", () => {
    expect(sparklinePath([], 100, 20)).toBe("");
    expect(sparklinePath([980], 100, 20)).toBe("");
  });

  it("maps two endpoints across width with inverted y", () => {
    const path = sparklinePath([900, 1000], 100, 20);
    expect(path).toBe("M 0,20 L 100,0");
  });

  it("draws a flat series at mid height", () => {
    const path = sparklinePath([980, 980, 980], 100, 20);
    expect(path).toBe("M 0,10 L 50,10 L 100,10");
  });

  it("preserves monotonic y ordering for ascending ratings", () => {
    const path = sparklinePath([900, 950, 1000], 100, 20);
    const ys = [...path.matchAll(/,(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]!));
    expect(ys[0]!).toBeGreaterThan(ys[1]!);
    expect(ys[1]!).toBeGreaterThan(ys[2]!);
  });
});

describe("sparklineSummary", () => {
  it("describes a multi-point series", () => {
    expect(sparklineSummary([985, 990, 1012])).toBe("3 rounds, 985 to 1012");
  });

  it("handles a single point", () => {
    expect(sparklineSummary([1000])).toBe("1 round, 1000");
  });

  it("handles an empty series", () => {
    expect(sparklineSummary([])).toBe("No rated rounds");
  });
});
