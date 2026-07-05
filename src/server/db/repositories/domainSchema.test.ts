// Repository round-trip test for the Common-A domain schema (sub-plan 01):
// "insert -> season-scoped read" for every new/extended table, plus a
// `loadSeasonSnapshot` smoke test against the real seed fixture.
//
// Same dynamic-import pattern as src/server/ingestion/pipeline.test.ts (see
// that file's header comment for why): `@server/config` freezes
// `process.env` at first import, so `DATA_DIR` must be set before any
// server module is imported, and every server import below is deferred
// into `beforeAll`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let tempDir: string;

// Typed via `Awaited<ReturnType<...>>`-style dynamic imports below; kept as
// loosely-typed locals here since the whole point of `beforeAll` is to
// defer the actual `import()` calls.
let applyMigrations: () => void;
let seed: () => unknown;
let insertHolder: typeof import("@server/db/repositories/tagHolders").insertHolder;
let insertSource: typeof import("@server/db/repositories/eventSources").insertSource;
let insertEvent: typeof import("@server/db/repositories/events").insertEvent;
let insertResult: typeof import("@server/db/repositories/eventResults").insertResult;
let listResultsByEvent: typeof import("@server/db/repositories/eventResults").listResultsByEvent;
let upsertMatch: typeof import("@server/db/repositories/playerMatches").upsertMatch;
let getMatch: typeof import("@server/db/repositories/playerMatches").getMatch;
let getStickyMatches: typeof import("@server/db/repositories/playerMatches").getStickyMatches;
let insertRating: typeof import("@server/db/repositories/ratingsHistory").insertRating;
let listRatingsByHolder: typeof import("@server/db/repositories/ratingsHistory").listRatingsByHolder;
let insertSwitch: typeof import("@server/db/repositories/poolSwitches").insertSwitch;
let listSwitchesByHolder: typeof import("@server/db/repositories/poolSwitches").listSwitchesByHolder;
let upsertEntryCount: typeof import("@server/db/repositories/entryCounts").upsertEntryCount;
let getEntryCount: typeof import("@server/db/repositories/entryCounts").getEntryCount;
let recordAudit: typeof import("@server/db/repositories/auditLog").recordAudit;
let listAudit: typeof import("@server/db/repositories/auditLog").listAudit;
let loadSeasonSnapshot: typeof import("@server/db/repositories/seasonSnapshot").loadSeasonSnapshot;

const SEASON_YEAR = 2026;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-vitest-domain-"));
  process.env.DATA_DIR = tempDir;

  const [
    migrateMod,
    seedMod,
    tagHoldersRepo,
    eventSourcesRepo,
    eventsRepo,
    eventResultsRepo,
    playerMatchesRepo,
    ratingsHistoryRepo,
    poolSwitchesRepo,
    entryCountsRepo,
    auditLogRepo,
    seasonSnapshotRepo,
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/db/repositories/tagHolders"),
    import("@server/db/repositories/eventSources"),
    import("@server/db/repositories/events"),
    import("@server/db/repositories/eventResults"),
    import("@server/db/repositories/playerMatches"),
    import("@server/db/repositories/ratingsHistory"),
    import("@server/db/repositories/poolSwitches"),
    import("@server/db/repositories/entryCounts"),
    import("@server/db/repositories/auditLog"),
    import("@server/db/repositories/seasonSnapshot"),
  ]);

  applyMigrations = migrateMod.applyMigrations;
  seed = seedMod.seed;
  insertHolder = tagHoldersRepo.insertHolder;
  insertSource = eventSourcesRepo.insertSource;
  insertEvent = eventsRepo.insertEvent;
  insertResult = eventResultsRepo.insertResult;
  listResultsByEvent = eventResultsRepo.listResultsByEvent;
  upsertMatch = playerMatchesRepo.upsertMatch;
  getMatch = playerMatchesRepo.getMatch;
  getStickyMatches = playerMatchesRepo.getStickyMatches;
  insertRating = ratingsHistoryRepo.insertRating;
  listRatingsByHolder = ratingsHistoryRepo.listRatingsByHolder;
  insertSwitch = poolSwitchesRepo.insertSwitch;
  listSwitchesByHolder = poolSwitchesRepo.listSwitchesByHolder;
  upsertEntryCount = entryCountsRepo.upsertEntryCount;
  getEntryCount = entryCountsRepo.getEntryCount;
  recordAudit = auditLogRepo.recordAudit;
  listAudit = auditLogRepo.listAudit;
  loadSeasonSnapshot = seasonSnapshotRepo.loadSeasonSnapshot;

  applyMigrations();
  seed();
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

describe("domain schema repositories: insert -> season-scoped read round-trip", () => {
  it("events / event_results round-trip through a fresh holder + source", () => {
    const holderId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Riley Test",
      tagNumber: 999,
      pool: "A",
      entryDate: "2026-03-01T00:00:00.000Z",
      pdgaNumber: 999999,
      ratingAtEntry: 950,
      pdgaMembership: true,
    });

    const sourceId = insertSource({
      seasonYear: SEASON_YEAR,
      pdgaEventId: "TEST-SOURCE",
      type: "TOURNAMENT",
      label: "Test Tournament",
    });

    const eventId = insertEvent({
      seasonYear: SEASON_YEAR,
      eventSourceId: sourceId,
      type: "Tournament",
      label: "Test Tournament Round 1",
      eventDate: "2026-06-01",
    });

    insertResult({
      seasonYear: SEASON_YEAR,
      eventId,
      pdgaNumber: 999999,
      displayName: "Riley Test",
      holderId,
      rawScoreToPar: -5,
      roundRating: 970,
      playerRatingReported: 950,
    });

    const results = listResultsByEvent(eventId);
    expect(results).toHaveLength(1);
    expect(results[0]?.holderId).toBe(holderId);
    expect(results[0]?.rawScoreToPar).toBe(-5);
    expect(results[0]?.tagPresent).toBe(true);
    expect(results[0]?.roundFinal).toBe(true);
  });

  it("player_matches upsert is sticky on (seasonYear, pdgaNumber)", () => {
    const holderId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Match Test",
      tagNumber: 998,
      pool: "B",
      entryDate: "2026-03-01T00:00:00.000Z",
    });

    upsertMatch({
      seasonYear: SEASON_YEAR,
      pdgaNumber: 888888,
      holderId,
      source: "auto",
      decidedBy: "auto",
    });
    upsertMatch({
      seasonYear: SEASON_YEAR,
      pdgaNumber: 888888,
      holderId,
      source: "admin",
      decidedBy: "director@example.com",
    });

    const match = getMatch(SEASON_YEAR, 888888);
    expect(match?.holderId).toBe(holderId);
    expect(match?.source).toBe("admin");
    expect(match?.decidedBy).toBe("director@example.com");
  });

  it("player_matches round-trips confirmed non-holder and sticky map", () => {
    upsertMatch({
      seasonYear: SEASON_YEAR,
      pdgaNumber: 777777,
      holderId: null,
      source: "admin",
      decidedBy: "director@example.com",
    });

    const row = getMatch(SEASON_YEAR, 777777);
    expect(row?.holderId).toBeNull();
    expect(row?.source).toBe("admin");

    const sticky = getStickyMatches(SEASON_YEAR);
    expect(sticky.get(777777)).toEqual({ holderId: null, source: "admin" });
  });

  it("player_matches auto upsert does not override admin", () => {
    const holderId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Auto Override Test",
      tagNumber: 995,
      pool: "A",
      entryDate: "2026-03-01T00:00:00.000Z",
    });

    upsertMatch({
      seasonYear: SEASON_YEAR,
      pdgaNumber: 666666,
      holderId,
      source: "admin",
      decidedBy: "director@example.com",
    });
    upsertMatch({
      seasonYear: SEASON_YEAR,
      pdgaNumber: 666666,
      holderId: holderId + 999,
      source: "auto",
      decidedBy: "auto",
    });

    const row = getMatch(SEASON_YEAR, 666666);
    expect(row?.holderId).toBe(holderId);
    expect(row?.source).toBe("admin");
  });

  it("ratings_history round-trips per holder", () => {
    const holderId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Rating Test",
      tagNumber: 997,
      pool: "A",
      entryDate: "2026-03-01T00:00:00.000Z",
    });

    insertRating({ seasonYear: SEASON_YEAR, holderId, effectiveDate: "2026-03-10", rating: 900 });
    insertRating({ seasonYear: SEASON_YEAR, holderId, effectiveDate: "2026-04-14", rating: 910 });

    const rows = listRatingsByHolder(holderId);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.rating).sort()).toEqual([900, 910]);
  });

  it("pool_switches round-trips per holder", () => {
    const holderId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Switch Test",
      tagNumber: 996,
      pool: "B",
      entryDate: "2026-03-01T00:00:00.000Z",
    });

    insertSwitch({
      seasonYear: SEASON_YEAR,
      holderId,
      effectiveDate: "2026-05-01",
      fromPool: "B",
      toPool: "A",
      approvedBy: "director@example.com",
    });

    const rows = listSwitchesByHolder(holderId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.fromPool).toBe("B");
    expect(rows[0]?.toPool).toBe("A");
  });

  it("entry_counts upsert corrects an existing event's paid count", () => {
    const sourceId = insertSource({
      seasonYear: SEASON_YEAR,
      pdgaEventId: "TEST-SOURCE-2",
      type: "FOD_OPEN",
      label: "Test FOD Open",
    });
    const eventId = insertEvent({
      seasonYear: SEASON_YEAR,
      eventSourceId: sourceId,
      type: "FODOpen",
      label: "Test FOD Open",
      eventDate: "2026-09-01",
    });

    upsertEntryCount({ seasonYear: SEASON_YEAR, eventId, paidEntries: 20 });
    upsertEntryCount({ seasonYear: SEASON_YEAR, eventId, paidEntries: 22 });

    expect(getEntryCount(eventId)?.paidEntries).toBe(22);
  });

  it("audit_log is append-only and season-scoped", () => {
    recordAudit({
      seasonYear: SEASON_YEAR,
      actorEmail: "director@example.com",
      action: "update",
      entityType: "tagHolder",
      entityId: "1",
      before: { pool: "A" },
      after: { pool: "B" },
    });

    const rows = listAudit(SEASON_YEAR, 10);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]?.actorEmail).toBe("director@example.com");
  });

  it("loadSeasonSnapshot assembles the reshaped engine input from the seed fixture", () => {
    // sub-plan 04 reshaped this loader to return `@/lib`'s authoritative
    // `SeasonSnapshot` (the pure engine's input) rather than the sub-plan-01
    // DB-row-shaped first cut — hence `holders`/`subLeagues`/`ratings` and
    // results nested under each event. See seasonSnapshot.ts's header.
    const snapshot = loadSeasonSnapshot(SEASON_YEAR);

    expect(snapshot.seasonYear).toBe(SEASON_YEAR);
    // 6 seeded holders + however many this file inserted above.
    expect(snapshot.holders.length).toBeGreaterThanOrEqual(6);
    // Always exactly the three sub-leagues (EARLY/MID/LATE): the loader
    // projects the flat event_sources list onto these three, so the extra
    // TOURNAMENT / FOD_OPEN sources this file added don't surface here.
    expect(snapshot.subLeagues.length).toBe(3);
    expect(snapshot.events.length).toBeGreaterThanOrEqual(4);
    // event_results are nested under their event now, not a top-level list.
    const totalResults = snapshot.events.reduce((n, e) => n + e.results.length, 0);
    expect(totalResults).toBeGreaterThanOrEqual(10);
    expect(snapshot.ratings.length).toBeGreaterThanOrEqual(3);
    // Only sub-league entry counts feed the OLP pot, so the FOD_OPEN count
    // this file added above is intentionally dropped by the loader.
    expect(snapshot.entryCounts.length).toBeGreaterThanOrEqual(4);
    expect(
      snapshot.entryCounts.every((ec) =>
        ["EARLY", "MID", "LATE"].includes(ec.subLeagueType),
      ),
    ).toBe(true);

    // The seed's EARLY sub-league is marked complete with a real window.
    const early = snapshot.subLeagues.find((s) => s.type === "EARLY");
    expect(early?.complete).toBe(true);
    expect(early?.startDate).toBe("2026-04-01");
    expect(early?.endDate).toBe("2026-05-13");

    // The seed's 3rd Early League Night is canceled.
    const canceledEvent = snapshot.events.find((e) => e.roundOrdinal === 3);
    expect(canceledEvent?.canceled).toBe(true);
  });
});
