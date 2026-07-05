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
let listSources: typeof import("@server/db/repositories/eventSources").listSources;
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
let upsertAceCount: typeof import("@server/db/repositories/entryCounts").upsertAceCount;
let getEntryCount: typeof import("@server/db/repositories/entryCounts").getEntryCount;
let getOpenings: typeof import("@server/db/repositories/financialOpenings").getOpenings;
let upsertOpenings: typeof import("@server/db/repositories/financialOpenings").upsertOpenings;
let listTagSales: typeof import("@server/db/repositories/tagSales").listTagSales;
let getTagSale: typeof import("@server/db/repositories/tagSales").getTagSale;
let insertTagSale: typeof import("@server/db/repositories/tagSales").insertTagSale;
let deleteTagSale: typeof import("@server/db/repositories/tagSales").deleteTagSale;
let listPayouts: typeof import("@server/db/repositories/payouts").listPayouts;
let getPayout: typeof import("@server/db/repositories/payouts").getPayout;
let insertPayout: typeof import("@server/db/repositories/payouts").insertPayout;
let deletePayout: typeof import("@server/db/repositories/payouts").deletePayout;
let listExpenses: typeof import("@server/db/repositories/expenses").listExpenses;
let getExpense: typeof import("@server/db/repositories/expenses").getExpense;
let insertExpense: typeof import("@server/db/repositories/expenses").insertExpense;
let deleteExpense: typeof import("@server/db/repositories/expenses").deleteExpense;
let listAdjustments: typeof import("@server/db/repositories/financialAdjustments").listAdjustments;
let getAdjustment: typeof import("@server/db/repositories/financialAdjustments").getAdjustment;
let insertAdjustment: typeof import("@server/db/repositories/financialAdjustments").insertAdjustment;
let deleteAdjustment: typeof import("@server/db/repositories/financialAdjustments").deleteAdjustment;
let recordAudit: typeof import("@server/db/repositories/auditLog").recordAudit;
let listAudit: typeof import("@server/db/repositories/auditLog").listAudit;
let loadSeasonSnapshot: typeof import("@server/db/repositories/seasonSnapshot").loadSeasonSnapshot;
let computeSeason: typeof import("@server/engine/season").computeSeason;
let insertSeasonRow: (year: number) => void;

const SEASON_YEAR = 2026;
const FINANCIAL_SNAPSHOT_SEASON = 2098;
const EMPTY_FINANCIAL_SEASON = 2099;

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
    financialOpeningsRepo,
    tagSalesRepo,
    payoutsRepo,
    expensesRepo,
    financialAdjustmentsRepo,
    auditLogRepo,
    seasonSnapshotRepo,
    engineMod,
    dbClientMod,
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
    import("@server/db/repositories/financialOpenings"),
    import("@server/db/repositories/tagSales"),
    import("@server/db/repositories/payouts"),
    import("@server/db/repositories/expenses"),
    import("@server/db/repositories/financialAdjustments"),
    import("@server/db/repositories/auditLog"),
    import("@server/db/repositories/seasonSnapshot"),
    import("@server/engine/season"),
    import("@server/db/client"),
  ]);

  applyMigrations = migrateMod.applyMigrations;
  seed = seedMod.seed;
  insertHolder = tagHoldersRepo.insertHolder;
  insertSource = eventSourcesRepo.insertSource;
  listSources = eventSourcesRepo.listSources;
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
  upsertAceCount = entryCountsRepo.upsertAceCount;
  getEntryCount = entryCountsRepo.getEntryCount;
  getOpenings = financialOpeningsRepo.getOpenings;
  upsertOpenings = financialOpeningsRepo.upsertOpenings;
  listTagSales = tagSalesRepo.listTagSales;
  getTagSale = tagSalesRepo.getTagSale;
  insertTagSale = tagSalesRepo.insertTagSale;
  deleteTagSale = tagSalesRepo.deleteTagSale;
  listPayouts = payoutsRepo.listPayouts;
  getPayout = payoutsRepo.getPayout;
  insertPayout = payoutsRepo.insertPayout;
  deletePayout = payoutsRepo.deletePayout;
  listExpenses = expensesRepo.listExpenses;
  getExpense = expensesRepo.getExpense;
  insertExpense = expensesRepo.insertExpense;
  deleteExpense = expensesRepo.deleteExpense;
  listAdjustments = financialAdjustmentsRepo.listAdjustments;
  getAdjustment = financialAdjustmentsRepo.getAdjustment;
  insertAdjustment = financialAdjustmentsRepo.insertAdjustment;
  deleteAdjustment = financialAdjustmentsRepo.deleteAdjustment;
  recordAudit = auditLogRepo.recordAudit;
  listAudit = auditLogRepo.listAudit;
  loadSeasonSnapshot = seasonSnapshotRepo.loadSeasonSnapshot;
  computeSeason = engineMod.computeSeason;
  const { db } = dbClientMod;
  const { seasons } = await import("@server/db/schema");
  insertSeasonRow = (year: number) => {
    db.insert(seasons).values({ year }).onConflictDoNothing({ target: seasons.year }).run();
  };

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

  it("financial_openings upsert round-trips and overwrites on same seasonYear", () => {
    upsertOpenings({
      seasonYear: SEASON_YEAR,
      aceOpeningCents: 5000,
      reservesOpeningCents: 120000,
    });

    let row = getOpenings(SEASON_YEAR);
    expect(row?.aceOpeningCents).toBe(5000);
    expect(row?.reservesOpeningCents).toBe(120000);

    upsertOpenings({
      seasonYear: SEASON_YEAR,
      aceOpeningCents: 7500,
      reservesOpeningCents: 125000,
    });

    row = getOpenings(SEASON_YEAR);
    expect(row?.aceOpeningCents).toBe(7500);
    expect(row?.reservesOpeningCents).toBe(125000);
  });

  it("tag_sales insert/list/get/delete round-trip cents and nullable note", () => {
    const id = insertTagSale({
      seasonYear: SEASON_YEAR,
      saleDate: "2026-04-15",
      count: 3,
      note: "Spring batch",
    });

    const row = getTagSale(id);
    expect(row?.saleDate).toBe("2026-04-15");
    expect(row?.count).toBe(3);
    expect(row?.note).toBe("Spring batch");

    const listed = listTagSales(SEASON_YEAR);
    expect(listed.some((s) => s.id === id)).toBe(true);

    deleteTagSale(id);
    expect(getTagSale(id)).toBeUndefined();
  });

  it("payouts insert/list round-trip enums, nullable cols, and holder FK", () => {
    const holderId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Payout Test",
      tagNumber: 994,
      pool: "A",
      entryDate: "2026-03-01T00:00:00.000Z",
    });

    const olpId = insertPayout({
      seasonYear: SEASON_YEAR,
      kind: "OLP",
      paidDate: "2026-05-14",
      amountCents: 5000,
      subLeague: "EARLY",
      recipientHolderId: holderId,
    });
    const skinsId = insertPayout({
      seasonYear: SEASON_YEAR,
      kind: "SKINS",
      paidDate: "2026-10-01",
      amountCents: 186700,
      pool: "A",
      recipientHolderId: holderId,
    });
    const aceId = insertPayout({
      seasonYear: SEASON_YEAR,
      kind: "ACE",
      paidDate: "2026-06-15",
      amountCents: 5000,
      recipientHolderId: null,
      note: "Non-holder ace",
    });

    const olp = getPayout(olpId);
    expect(olp?.kind).toBe("OLP");
    expect(olp?.subLeague).toBe("EARLY");
    expect(olp?.pool).toBeNull();
    expect(olp?.recipientHolderId).toBe(holderId);

    const skins = getPayout(skinsId);
    expect(skins?.kind).toBe("SKINS");
    expect(skins?.pool).toBe("A");
    expect(skins?.subLeague).toBeNull();

    const ace = getPayout(aceId);
    expect(ace?.recipientHolderId).toBeNull();
    expect(ace?.note).toBe("Non-holder ace");

    expect(listPayouts(SEASON_YEAR).length).toBeGreaterThanOrEqual(3);

    deletePayout(aceId);
    expect(getPayout(aceId)).toBeUndefined();
  });

  it("expenses insert/list round-trip category enum and delete", () => {
    const id = insertExpense({
      seasonYear: SEASON_YEAR,
      spentDate: "2026-04-20",
      amountCents: 35000,
      category: "pdga_fees",
      description: "League PDGA fees",
    });

    const row = getExpense(id);
    expect(row?.amountCents).toBe(35000);
    expect(row?.category).toBe("pdga_fees");
    expect(row?.description).toBe("League PDGA fees");

    expect(listExpenses(SEASON_YEAR).some((e) => e.id === id)).toBe(true);

    deleteExpense(id);
    expect(getExpense(id)).toBeUndefined();
  });

  it("financial_adjustments insert/list round-trip fund enum and signed cents", () => {
    const id = insertAdjustment({
      seasonYear: SEASON_YEAR,
      fund: "olp:EARLY",
      deltaCents: -500,
      adjustedDate: "2026-05-01",
      reason: "Correction after recount",
    });

    const row = getAdjustment(id);
    expect(row?.fund).toBe("olp:EARLY");
    expect(row?.deltaCents).toBe(-500);
    expect(row?.reason).toBe("Correction after recount");

    const skinsAdjId = insertAdjustment({
      seasonYear: SEASON_YEAR,
      fund: "skins:B",
      deltaCents: 100,
      adjustedDate: "2026-05-02",
      reason: "Rounding fix",
    });
    expect(getAdjustment(skinsAdjId)?.fund).toBe("skins:B");

    expect(listAdjustments(SEASON_YEAR).length).toBeGreaterThanOrEqual(2);

    deleteAdjustment(id);
    expect(getAdjustment(id)).toBeUndefined();
  });

  it("entry_counts paid and ace upserts coexist without clobbering", () => {
    const lateSource = listSources(SEASON_YEAR).find((s) => s.type === "LATE");
    expect(lateSource).toBeDefined();

    const eventId = insertEvent({
      seasonYear: SEASON_YEAR,
      eventSourceId: lateSource!.id,
      type: "LeagueNight",
      label: "Ace Count Night",
      eventDate: "2026-08-01",
      roundOrdinal: 99,
    });

    upsertEntryCount({ seasonYear: SEASON_YEAR, eventId, paidEntries: 18 });
    expect(getEntryCount(eventId)?.paidEntries).toBe(18);
    expect(getEntryCount(eventId)?.aceEntries).toBe(0);

    upsertAceCount({ seasonYear: SEASON_YEAR, eventId, aceEntries: 11 });
    expect(getEntryCount(eventId)?.paidEntries).toBe(18);
    expect(getEntryCount(eventId)?.aceEntries).toBe(11);

    upsertEntryCount({ seasonYear: SEASON_YEAR, eventId, paidEntries: 20 });
    expect(getEntryCount(eventId)?.paidEntries).toBe(20);
    expect(getEntryCount(eventId)?.aceEntries).toBe(11);

    upsertAceCount({ seasonYear: SEASON_YEAR, eventId, aceEntries: 9 });
    expect(getEntryCount(eventId)?.paidEntries).toBe(20);
    expect(getEntryCount(eventId)?.aceEntries).toBe(9);
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

    expect(snapshot.financial).toBeDefined();
    expect(snapshot.financial?.openings.aceCents).toBeGreaterThanOrEqual(0);
    expect(snapshot.financial?.openings.reservesCents).toBeGreaterThanOrEqual(0);
    expect(snapshot.financial?.nights.length).toBeGreaterThanOrEqual(4);
    expect(
      snapshot.financial?.nights.every((night) =>
        ["EARLY", "MID", "LATE"].includes(night.subLeagueType),
      ),
    ).toBe(true);
  });
});

function seedFinancialSnapshotSeason(): {
  earlyNight1EventId: number;
  earlyNight2EventId: number;
  midNightEventId: number;
  tagSaleId: number;
  olpPayoutId: number;
  skinsPayoutId: number;
  expenseId: number;
  adjustmentId: number;
  holderId: number;
} {
  insertSeasonRow(FINANCIAL_SNAPSHOT_SEASON);

  const holderId = insertHolder({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    name: "Financial Snapshot Test",
    tagNumber: 2098,
    pool: "A",
    entryDate: "2098-01-15T00:00:00.000Z",
    pdgaNumber: 209809,
    ratingAtEntry: 950,
    pdgaMembership: true,
  });

  const earlySourceId = insertSource({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    pdgaEventId: "FIN-EARLY-2098",
    type: "EARLY",
    label: "2098 Early",
    startDate: "2098-05-01",
    endDate: "2098-05-31",
  });
  const midSourceId = insertSource({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    pdgaEventId: "FIN-MID-2098",
    type: "MID",
    label: "2098 Mid",
    startDate: "2098-06-01",
    endDate: "2098-06-30",
  });
  const tournamentSourceId = insertSource({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    pdgaEventId: "FIN-TOUR-2098",
    type: "TOURNAMENT",
    label: "2098 Tournament",
  });

  const earlyNight1EventId = insertEvent({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    eventSourceId: earlySourceId,
    type: "LeagueNight",
    label: "Early Night 1",
    eventDate: "2098-05-01",
    roundOrdinal: 1,
  });
  const earlyNight2EventId = insertEvent({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    eventSourceId: earlySourceId,
    type: "LeagueNight",
    label: "Early Ace-Only Night",
    eventDate: "2098-05-08",
    roundOrdinal: 2,
  });
  const midNightEventId = insertEvent({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    eventSourceId: midSourceId,
    type: "LeagueNight",
    label: "Mid Night 1",
    eventDate: "2098-06-01",
    roundOrdinal: 1,
  });
  const tournamentEventId = insertEvent({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    eventSourceId: tournamentSourceId,
    type: "Tournament",
    label: "2098 Tournament Round",
    eventDate: "2098-07-01",
  });

  upsertEntryCount({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    eventId: earlyNight1EventId,
    paidEntries: 10,
    aceEntries: 6,
  });
  upsertAceCount({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    eventId: earlyNight2EventId,
    aceEntries: 3,
  });
  upsertEntryCount({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    eventId: midNightEventId,
    paidEntries: 5,
  });
  upsertEntryCount({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    eventId: tournamentEventId,
    paidEntries: 99,
  });

  upsertOpenings({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    aceOpeningCents: 5000,
    reservesOpeningCents: 10000,
  });

  const tagSaleId = insertTagSale({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    saleDate: "2098-04-15",
    count: 2,
  });
  const expenseId = insertExpense({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    spentDate: "2098-04-20",
    amountCents: 3500,
    category: "pdga_fees",
    description: "League PDGA fees",
  });
  const olpPayoutId = insertPayout({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    kind: "OLP",
    paidDate: "2098-05-14",
    amountCents: 2000,
    subLeague: "EARLY",
    recipientHolderId: holderId,
  });
  const skinsPayoutId = insertPayout({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    kind: "SKINS",
    paidDate: "2098-10-01",
    amountCents: 1000,
    pool: "A",
    recipientHolderId: holderId,
  });
  const adjustmentId = insertAdjustment({
    seasonYear: FINANCIAL_SNAPSHOT_SEASON,
    fund: "reserves",
    deltaCents: 500,
    adjustedDate: "2098-05-02",
    reason: "Manual correction",
  });

  return {
    earlyNight1EventId,
    earlyNight2EventId,
    midNightEventId,
    tagSaleId,
    olpPayoutId,
    skinsPayoutId,
    expenseId,
    adjustmentId,
    holderId,
  };
}

describe("loadSeasonSnapshot financial slice (Common C chunk 03)", () => {
  let seeded: ReturnType<typeof seedFinancialSnapshotSeason>;

  beforeAll(() => {
    seeded = seedFinancialSnapshotSeason();
  });

  it("assembles financial openings, nights, tag sales, payouts, expenses, and adjustments", () => {
    const snapshot = loadSeasonSnapshot(FINANCIAL_SNAPSHOT_SEASON);
    const { financial } = snapshot;

    expect(financial).toBeDefined();
    expect(financial?.openings).toEqual({ aceCents: 5000, reservesCents: 10000 });

    const nights = [...(financial?.nights ?? [])].sort((a, b) => a.eventId - b.eventId);
    expect(nights).toEqual([
      {
        eventId: seeded.earlyNight1EventId,
        subLeagueType: "EARLY",
        eventDate: "2098-05-01",
        paidEntries: 10,
        aceEntries: 6,
      },
      {
        eventId: seeded.earlyNight2EventId,
        subLeagueType: "EARLY",
        eventDate: "2098-05-08",
        paidEntries: 0,
        aceEntries: 3,
      },
      {
        eventId: seeded.midNightEventId,
        subLeagueType: "MID",
        eventDate: "2098-06-01",
        paidEntries: 5,
        aceEntries: 0,
      },
    ]);

    expect(financial?.tagSales).toEqual([
      { id: seeded.tagSaleId, saleDate: "2098-04-15", count: 2 },
    ]);
    expect(financial?.payouts).toEqual(
      expect.arrayContaining([
        {
          id: seeded.olpPayoutId,
          kind: "OLP",
          paidDate: "2098-05-14",
          amountCents: 2000,
          subLeague: "EARLY",
          pool: null,
          recipientHolderId: seeded.holderId,
        },
        {
          id: seeded.skinsPayoutId,
          kind: "SKINS",
          paidDate: "2098-10-01",
          amountCents: 1000,
          subLeague: null,
          pool: "A",
          recipientHolderId: seeded.holderId,
        },
      ]),
    );
    expect(financial?.expenses).toEqual([
      {
        id: seeded.expenseId,
        spentDate: "2098-04-20",
        amountCents: 3500,
        category: "pdga_fees",
        description: "League PDGA fees",
      },
    ]);
    expect(financial?.adjustments).toEqual([
      {
        id: seeded.adjustmentId,
        fund: "reserves",
        deltaCents: 500,
        adjustedDate: "2098-05-02",
        reason: "Manual correction",
      },
    ]);

    expect(snapshot.entryCounts).toEqual(
      expect.arrayContaining([
        { subLeagueType: "EARLY", paidEntries: 10 },
        { subLeagueType: "EARLY", paidEntries: 0 },
        { subLeagueType: "MID", paidEntries: 5 },
      ]),
    );
    expect(snapshot.entryCounts.some((ec) => ec.paidEntries === 99)).toBe(false);
  });

  it("computeSeason end-to-end: fund balances and total match hand calc; OLP inflow matches olpPot × 100", () => {
    const snapshot = loadSeasonSnapshot(FINANCIAL_SNAPSHOT_SEASON);
    const results = computeSeason(snapshot);
    const { funds, totalCashCents } = results.financials;

    // Hand calc from the seeded facts (cents): openings + night splits + tag
    // sales − expenses − payouts ± adjustments.
    expect(funds.reserves).toBe(14300);
    expect(funds.ace).toBe(5900);
    expect(funds.olp.EARLY).toBe(-1000);
    expect(funds.olp.MID).toBe(500);
    expect(funds.olp.LATE).toBe(0);
    expect(funds.skins.A).toBe(1800);
    expect(funds.skins.B).toBe(1400);
    expect(totalCashCents).toBe(22900);

    const sumFunds =
      funds.reserves +
      funds.ace +
      funds.olp.EARLY +
      funds.olp.MID +
      funds.olp.LATE +
      funds.skins.A +
      funds.skins.B;
    expect(sumFunds).toBe(totalCashCents);
    expect(results.financials.ledger.at(-1)?.runningTotalCents).toBe(totalCashCents);

    const olpInflow = (type: "EARLY" | "MID" | "LATE") =>
      results.financials.ledger
        .filter((entry) => entry.kind === "league-night")
        .flatMap((entry) => entry.deltas)
        .filter((delta) => delta.fund === `olp:${type}`)
        .reduce((acc, delta) => acc + delta.cents, 0);

    expect(olpInflow("EARLY")).toBe(results.olpPot.EARLY * 100);
    expect(olpInflow("MID")).toBe(results.olpPot.MID * 100);
    expect(olpInflow("LATE")).toBe(0);
  });

  it("empty season yields zeroed financial slice and zero fund balances", () => {
    insertSeasonRow(EMPTY_FINANCIAL_SEASON);

    const snapshot = loadSeasonSnapshot(EMPTY_FINANCIAL_SEASON);
    expect(snapshot.financial).toEqual({
      openings: { aceCents: 0, reservesCents: 0 },
      nights: [],
      tagSales: [],
      payouts: [],
      expenses: [],
      adjustments: [],
    });

    const results = computeSeason(snapshot);
    expect(results.financials.totalCashCents).toBe(0);
    expect(results.financials.funds).toEqual({
      reserves: 0,
      ace: 0,
      olp: { EARLY: 0, MID: 0, LATE: 0 },
      skins: { A: 0, B: 0 },
    });
    expect(results.financials.ledger).toEqual([]);
  });
});
