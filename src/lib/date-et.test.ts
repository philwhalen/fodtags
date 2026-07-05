import { describe, expect, it } from "vitest";

import { todayEt } from "./date-et";

describe("todayEt", () => {
  it("returns the ET calendar date for a fixed instant", () => {
    // 2026-07-05T02:00:00Z is still 2026-07-04 in America/New_York (UTC-4
    // during EDT), so the date-only ET result stays on the prior day across
    // the UTC-midnight boundary.
    expect(todayEt("America/New_York", new Date("2026-07-05T02:00:00Z"))).toBe("2026-07-04");
  });

  it("rolls over to the next ET day once past ET midnight", () => {
    // 2026-07-05T05:00:00Z is 2026-07-05T01:00:00 EDT — after ET midnight.
    expect(todayEt("America/New_York", new Date("2026-07-05T05:00:00Z"))).toBe("2026-07-05");
  });

  it("defaults the timeZone to America/New_York", () => {
    expect(todayEt(undefined, new Date("2026-07-05T02:00:00Z"))).toBe("2026-07-04");
  });

  it("supports other IANA time zones", () => {
    // 2026-07-05T02:00:00Z is already 2026-07-05 in UTC.
    expect(todayEt("UTC", new Date("2026-07-05T02:00:00Z"))).toBe("2026-07-05");
  });
});
