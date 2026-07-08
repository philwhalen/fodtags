// tagOverrides repository tests (tag-reassignment sub-plan 01) — the only
// new admin INPUT the tag reassignment feature adds (Spec 02 §2.10
// architecture decision 3). Same dynamic-import-after-DATA_DIR pattern as
// tagHolders.test.ts / domainSchema.test.ts (see either file's header
// comment for why): `@server/config` freezes `process.env` at first
// import, so `DATA_DIR` must be set before any server module is imported,
// and every server import below is deferred into `beforeAll`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SEASON_YEAR = 2026;

let tempDir: string;
let insertHolder: typeof import("@server/db/repositories/tagHolders").insertHolder;
let insertSource: typeof import("@server/db/repositories/eventSources").insertSource;
let insertEvent: typeof import("@server/db/repositories/events").insertEvent;
let listOverridesBySeason: typeof import("@server/db/repositories/tagOverrides").listOverridesBySeason;
let upsertOverride: typeof import("@server/db/repositories/tagOverrides").upsertOverride;
let deleteOverride: typeof import("@server/db/repositories/tagOverrides").deleteOverride;

// `event_sources` has a unique (seasonYear, type) index (one PDGA event id
// per sub-league — Spec 03 §3.4), and the seed fixture already occupies
// EARLY/MID/LATE — so every League Night this file needs shares a single
// TOURNAMENT-typed source (unused by the seed) and is distinguished by a
// unique `roundOrdinal` instead.
let sharedSourceId: number;
let nextRoundOrdinal = 1;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-vitest-tagoverrides-"));
  process.env.DATA_DIR = tempDir;

  const [{ applyMigrations }, { seed }, tagHoldersRepo, eventSourcesRepo, eventsRepo, tagOverridesRepo] =
    await Promise.all([
      import("@server/db/migrate"),
      import("@server/db/seed"),
      import("@server/db/repositories/tagHolders"),
      import("@server/db/repositories/eventSources"),
      import("@server/db/repositories/events"),
      import("@server/db/repositories/tagOverrides"),
    ]);

  insertHolder = tagHoldersRepo.insertHolder;
  insertSource = eventSourcesRepo.insertSource;
  insertEvent = eventsRepo.insertEvent;
  listOverridesBySeason = tagOverridesRepo.listOverridesBySeason;
  upsertOverride = tagOverridesRepo.upsertOverride;
  deleteOverride = tagOverridesRepo.deleteOverride;

  applyMigrations();
  seed();

  sharedSourceId = insertSource({
    seasonYear: SEASON_YEAR,
    pdgaEventId: "TAG-OVERRIDE-TEST-SOURCE",
    type: "TOURNAMENT",
    label: "Tag Override Test Source",
  });
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

function seedNight(label: string, eventDate: string) {
  return insertEvent({
    seasonYear: SEASON_YEAR,
    eventSourceId: sharedSourceId,
    type: "LeagueNight",
    label: `Tag Override Night ${label}`,
    eventDate,
    roundOrdinal: nextRoundOrdinal++,
  });
}

describe("tagOverrides repository: the only new admin input (sub-plan 01)", () => {
  it("upsertOverride inserts, listOverridesBySeason returns it season-scoped", () => {
    const holderId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Override Test One",
      tagNumber: 811,
      pool: "A",
      entryDate: "2026-05-01T00:00:00.000Z",
    });
    const eventId = seedNight("A", "2026-05-01");

    upsertOverride({
      seasonYear: SEASON_YEAR,
      eventId,
      holderId,
      tagOut: 3,
      decidedBy: "director@example.com",
    });

    const rows = listOverridesBySeason(SEASON_YEAR);
    const row = rows.find((r) => r.eventId === eventId && r.holderId === holderId);
    expect(row).toBeDefined();
    expect(row?.tagOut).toBe(3);
    expect(row?.decidedBy).toBe("director@example.com");
    expect(row?.decidedAt).toEqual(expect.any(String));
  });

  it("upsertOverride is idempotent on (eventId, holderId) — a second decision replaces the first, not adds a row", () => {
    const holderId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Override Test Two",
      tagNumber: 812,
      pool: "A",
      entryDate: "2026-05-01T00:00:00.000Z",
    });
    const eventId = seedNight("B", "2026-05-08");

    upsertOverride({
      seasonYear: SEASON_YEAR,
      eventId,
      holderId,
      tagOut: 5,
      decidedBy: "director@example.com",
    });
    upsertOverride({
      seasonYear: SEASON_YEAR,
      eventId,
      holderId,
      tagOut: 7,
      decidedBy: "other-director@example.com",
    });

    const rows = listOverridesBySeason(SEASON_YEAR).filter(
      (r) => r.eventId === eventId && r.holderId === holderId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tagOut).toBe(7);
    expect(rows[0]?.decidedBy).toBe("other-director@example.com");
  });

  it("deleteOverride clears a decision back to computed (no row for that eventId/holderId)", () => {
    const holderId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Override Test Three",
      tagNumber: 813,
      pool: "A",
      entryDate: "2026-05-01T00:00:00.000Z",
    });
    const eventId = seedNight("C", "2026-05-15");

    upsertOverride({
      seasonYear: SEASON_YEAR,
      eventId,
      holderId,
      tagOut: 2,
      decidedBy: "director@example.com",
    });
    expect(
      listOverridesBySeason(SEASON_YEAR).some((r) => r.eventId === eventId && r.holderId === holderId),
    ).toBe(true);

    deleteOverride(eventId, holderId);

    expect(
      listOverridesBySeason(SEASON_YEAR).some((r) => r.eventId === eventId && r.holderId === holderId),
    ).toBe(false);
  });

  it("different holders can each have an override for the same event", () => {
    const holderOneId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Override Test Four A",
      tagNumber: 814,
      pool: "A",
      entryDate: "2026-05-01T00:00:00.000Z",
    });
    const holderTwoId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Override Test Four B",
      tagNumber: 815,
      pool: "A",
      entryDate: "2026-05-01T00:00:00.000Z",
    });
    const eventId = seedNight("D", "2026-05-22");

    upsertOverride({
      seasonYear: SEASON_YEAR,
      eventId,
      holderId: holderOneId,
      tagOut: 1,
      decidedBy: "director@example.com",
    });
    upsertOverride({
      seasonYear: SEASON_YEAR,
      eventId,
      holderId: holderTwoId,
      tagOut: 4,
      decidedBy: "director@example.com",
    });

    const rows = listOverridesBySeason(SEASON_YEAR).filter((r) => r.eventId === eventId);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.tagOut).sort()).toEqual([1, 4]);
  });
});
