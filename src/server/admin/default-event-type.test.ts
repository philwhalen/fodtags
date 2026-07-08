// Unit tests for the admin Register-source `type` default (Spec 10 §10.3).
import { describe, expect, it } from "vitest";

import type { EventSourceType } from "@server/db/schema";

import { defaultEventSourceType } from "./default-event-type";

describe("defaultEventSourceType", () => {
  const cases: Array<{ existing: EventSourceType[]; expected: EventSourceType; note: string }> = [
    { existing: [], expected: "EARLY", note: "empty season → earliest slot" },
    { existing: ["EARLY"], expected: "MID", note: "Early filled → Mid" },
    { existing: ["EARLY", "MID"], expected: "LATE", note: "Early+Mid filled → Late" },
    { existing: ["EARLY", "MID", "LATE"], expected: "TOURNAMENT", note: "all sub-leagues → Tournament" },
    { existing: ["MID"], expected: "EARLY", note: "order, not presence count — Early still unfilled" },
    { existing: ["MID", "LATE"], expected: "EARLY", note: "earliest unfilled wins" },
    { existing: ["EARLY", "MID", "LATE", "TOURNAMENT"], expected: "TOURNAMENT", note: "stays Tournament" },
    { existing: ["EARLY", "EARLY", "MID"], expected: "LATE", note: "duplicate types tolerated" },
    { existing: ["FOD_OPEN"], expected: "EARLY", note: "FOD_OPEN does not fill a sub-league slot" },
    { existing: ["EARLY", "MID", "LATE", "FOD_OPEN"], expected: "TOURNAMENT", note: "FOD_OPEN is never returned" },
  ];

  for (const { existing, expected, note } of cases) {
    it(`[${existing.join(",")}] → ${expected} (${note})`, () => {
      expect(defaultEventSourceType(existing)).toBe(expected);
    });
  }
});
