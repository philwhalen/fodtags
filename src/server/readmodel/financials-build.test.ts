// Financials read-model build tests (plans/financials/02-readmodel-build.md
// "Tests"): seed a self-contained season (its own EARLY/MID/LATE event
// sources, decoupled from `src/server/db/seed.ts`'s shared 2026 fixture so
// the hand-computed dollar figures below aren't coupled to that fixture's
// own League-Night entry counts) with opening balances, League Nights
// across all three sub-leagues, a tag-sale batch, and an expense ->
// `buildAndPublish` -> `getPublished` returns the `financials` payload
// whose funds/ledger/totals reconcile with a hand computation; recording
// OLP/skins/ace payouts and marking sub-leagues complete flips the
// `subLeagueComplete`/`skinsPaidOut`/`projected` flags on rebuild; an empty
// pre-season publishes zeroed funds and an empty ledger.
//
// Same dynamic-import pattern as build.test.ts / score-sheet-build.test.ts:
// `@server/config` freezes `process.env` at first import, so `DATA_DIR`
// must be set before any server module loads. `@/lib` (pure, client-safe)
// is imported statically since it has no such dependency, as are
// type-only imports from `@server/readmodel/build`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PublicFinancialsPayload, SeasonSnapshot, SeasonResults } from "@/lib";
import type { ViewRow } from "@server/readmodel/build";

// A season year of its own — not the shared 2026 fixture — so this file's
// hand-computed dollar figures depend only on what it seeds itself.
const SEASON_YEAR = 2097;
const EMPTY_SEASON_YEAR = 2098;

let tempDir: string;
let buildViews: (seasonYear: number) => ViewRow[];
let buildAndPublish: (seasonYear: number) => number;
let getPublished: (
  seasonYear: number,
  viewKey: string,
) => { payload: unknown } | undefined;
let insertSource: (input: {
  seasonYear: number;
  pdgaEventId: string;
  type: "EARLY" | "MID" | "LATE";
  label: string;
  startDate?: string | null;
  endDate?: string | null;
  complete?: boolean;
}) => number;
let updateSource: (id: number, patch: { complete?: boolean }) => void;
let insertEvent: (input: {
  seasonYear: number;
  eventSourceId: number;
  type: "LeagueNight";
  label: string;
  eventDate: string;
  roundOrdinal: number;
}) => number;
let upsertEntryCount: (input: {
  seasonYear: number;
  eventId: number;
  paidEntries: number;
  aceEntries?: number;
}) => void;
let upsertOpenings: (input: {
  seasonYear: number;
  aceOpeningCents: number;
  reservesOpeningCents: number;
}) => void;
let insertTagSale: (input: {
  seasonYear: number;
  saleDate: string;
  count: number;
}) => number;
let insertExpense: (input: {
  seasonYear: number;
  spentDate: string;
  amountCents: number;
  category: "pdga_fees" | "trophies" | "ctp" | "contingency" | "other";
  description: string;
}) => number;
let insertPayout: (input: {
  seasonYear: number;
  kind: "OLP" | "SKINS" | "ACE";
  paidDate: string;
  amountCents: number;
  subLeague?: "EARLY" | "MID" | "LATE" | null;
  pool?: "A" | "B" | null;
}) => number;
let dbInsertSeason: (year: number) => void;
let loadSeasonSnapshot: (seasonYear: number) => SeasonSnapshot;
let computeSeason: (snapshot: SeasonSnapshot) => SeasonResults;

let earlySourceId: number;
let midSourceId: number;
let lateSourceId: number;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "fodtags-vitest-financials-build-"),
  );
  process.env.DATA_DIR = tempDir;

  const [
    { applyMigrations },
    readmodel,
    readModelRepo,
    eventSourcesRepo,
    eventsRepo,
    entryCountsRepo,
    financialOpeningsRepo,
    tagSalesRepo,
    expensesRepo,
    payoutsRepo,
    seasonSnapshotRepo,
    engine,
    dbClient,
    schema,
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/readmodel"),
    import("@server/db/repositories/readModel"),
    import("@server/db/repositories/eventSources"),
    import("@server/db/repositories/events"),
    import("@server/db/repositories/entryCounts"),
    import("@server/db/repositories/financialOpenings"),
    import("@server/db/repositories/tagSales"),
    import("@server/db/repositories/expenses"),
    import("@server/db/repositories/payouts"),
    import("@server/db/repositories/seasonSnapshot"),
    import("@server/engine"),
    import("@server/db/client"),
    import("@server/db/schema"),
  ]);

  buildViews = readmodel.buildViews;
  buildAndPublish = readmodel.buildAndPublish;
  getPublished = readModelRepo.getPublished;
  insertSource = eventSourcesRepo.insertSource;
  updateSource = eventSourcesRepo.updateSource;
  insertEvent = eventsRepo.insertEvent;
  upsertEntryCount = entryCountsRepo.upsertEntryCount;
  upsertOpenings = financialOpeningsRepo.upsertOpenings;
  insertTagSale = tagSalesRepo.insertTagSale;
  insertExpense = expensesRepo.insertExpense;
  insertPayout = payoutsRepo.insertPayout;
  loadSeasonSnapshot = seasonSnapshotRepo.loadSeasonSnapshot;
  computeSeason = engine.computeSeason;
  dbInsertSeason = (year: number) => {
    dbClient.db.insert(schema.seasons).values({ year }).run();
  };

  applyMigrations();

  dbInsertSeason(SEASON_YEAR);

  earlySourceId = insertSource({
    seasonYear: SEASON_YEAR,
    pdgaEventId: "FIN-TEST-EARLY",
    type: "EARLY",
    label: "Financials Test Early",
    startDate: "2097-04-01",
    endDate: "2097-05-13",
    complete: false,
  });
  midSourceId = insertSource({
    seasonYear: SEASON_YEAR,
    pdgaEventId: "FIN-TEST-MID",
    type: "MID",
    label: "Financials Test Mid",
    startDate: "2097-05-20",
    endDate: "2097-07-01",
    complete: false,
  });
  lateSourceId = insertSource({
    seasonYear: SEASON_YEAR,
    pdgaEventId: "FIN-TEST-LATE",
    type: "LATE",
    label: "Financials Test Late",
    startDate: "2097-07-08",
    endDate: "2097-08-26",
    complete: false,
  });

  const earlyEventId = insertEvent({
    seasonYear: SEASON_YEAR,
    eventSourceId: earlySourceId,
    type: "LeagueNight",
    label: "Financials Test Early Night",
    eventDate: "2097-04-15",
    roundOrdinal: 1,
  });
  const midEventId = insertEvent({
    seasonYear: SEASON_YEAR,
    eventSourceId: midSourceId,
    type: "LeagueNight",
    label: "Financials Test Mid Night",
    eventDate: "2097-05-25",
    roundOrdinal: 1,
  });
  const lateEventId = insertEvent({
    seasonYear: SEASON_YEAR,
    eventSourceId: lateSourceId,
    type: "LeagueNight",
    label: "Financials Test Late Night",
    eventDate: "2097-07-10",
    roundOrdinal: 1,
  });

  upsertEntryCount({ seasonYear: SEASON_YEAR, eventId: earlyEventId, paidEntries: 10, aceEntries: 8 });
  upsertEntryCount({ seasonYear: SEASON_YEAR, eventId: midEventId, paidEntries: 6, aceEntries: 4 });
  upsertEntryCount({ seasonYear: SEASON_YEAR, eventId: lateEventId, paidEntries: 8, aceEntries: 8 });

  upsertOpenings({ seasonYear: SEASON_YEAR, aceOpeningCents: 5000, reservesOpeningCents: 10000 });
  insertTagSale({ seasonYear: SEASON_YEAR, saleDate: "2097-02-01", count: 5 });
  insertExpense({
    seasonYear: SEASON_YEAR,
    spentDate: "2097-06-01",
    amountCents: 2000,
    category: "pdga_fees",
    description: "Annual PDGA sanctioning fee",
  });
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

function financialsPayload(): PublicFinancialsPayload {
  buildAndPublish(SEASON_YEAR);
  const view = getPublished(SEASON_YEAR, "financials");
  expect(view).toBeDefined();
  return view!.payload as PublicFinancialsPayload;
}

describe("financials build (plans/financials/02-readmodel-build.md)", () => {
  it("funds reconcile with the hand-computed per-entry splits before any payout", () => {
    const payload = financialsPayload();

    // EARLY (10 paid, 8 ace): skins 2800 -> 1867/933; olp 1000; reserves 2200; ace 800.
    // MID   (6 paid, 4 ace):  skins 1680 -> 1120/560;  olp 600;  reserves 1320; ace 400.
    // LATE  (8 paid, 8 ace):  skins 2240 -> 1493/747;  olp 800;  reserves 1760; ace 800.
    // reserves = 10000 (opening) + 2200+1320+1760 (nights) + 10000 (5 tag sales x 2000) - 2000 (expense) = 23280
    // ace = 5000 (opening) + 800+400+800 (nights) = 7000
    // skins.A = 1867+1120+1493 = 4480; skins.B = 933+560+747 = 2240
    expect(payload.funds.reserves).toBe(23280);
    expect(payload.funds.ace).toBe(7000);
    expect(payload.funds.olp.EARLY).toBe(1000);
    expect(payload.funds.olp.MID).toBe(600);
    expect(payload.funds.olp.LATE).toBe(800);
    expect(payload.funds.skins.A).toBe(4480);
    expect(payload.funds.skins.B).toBe(2240);

    const sumFunds =
      payload.funds.reserves +
      payload.funds.ace +
      payload.funds.olp.EARLY +
      payload.funds.olp.MID +
      payload.funds.olp.LATE +
      payload.funds.skins.A +
      payload.funds.skins.B;
    expect(payload.totalCashCents).toBe(sumFunds);
    expect(payload.totalCashCents).toBe(39400);

    expect(payload.totals).toEqual({ tagSales: 5, paidEntries: 24, aceEntries: 20 });
  });

  it("ledger is chronological with the opening row first and the last running total equal to total cash", () => {
    const payload = financialsPayload();

    expect(payload.ledger.length).toBeGreaterThan(0);
    expect(payload.ledger[0]!.kind).toBe("opening");

    const dates = payload.ledger.map((e) => e.date);
    const sortedDates = dates.slice().sort();
    expect(dates).toEqual(sortedDates);

    const last = payload.ledger[payload.ledger.length - 1]!;
    expect(last.runningTotalCents).toBe(payload.totalCashCents);
  });

  it("the gross OLP pot implied by league-night ledger deltas equals computeSeason's olpPot per sub-league", () => {
    const payload = financialsPayload();
    const snapshot = loadSeasonSnapshot(SEASON_YEAR);
    const results = computeSeason(snapshot);

    for (const type of ["EARLY", "MID", "LATE"] as const) {
      const grossCents = payload.ledger
        .filter((entry) => entry.kind === "league-night")
        .reduce((acc, entry) => {
          const delta = entry.deltas.find((d) => d.fund === `olp:${type}`);
          return acc + (delta?.cents ?? 0);
        }, 0);
      // olpPot is in dollars ($1 x paidEntries); the ledger delta is in cents.
      expect(grossCents).toBe(results.olpPot[type] * 100);
    }
  });

  it("projected is true while any sub-league is incomplete, and flips false once every sub-league is marked complete", () => {
    const before = financialsPayload();
    expect(before.subLeagueComplete).toEqual({ EARLY: false, MID: false, LATE: false });
    expect(before.projected).toBe(true);

    updateSource(earlySourceId, { complete: true });
    updateSource(midSourceId, { complete: true });
    updateSource(lateSourceId, { complete: true });
    try {
      const after = financialsPayload();
      expect(after.subLeagueComplete).toEqual({ EARLY: true, MID: true, LATE: true });
      expect(after.projected).toBe(false);
    } finally {
      updateSource(earlySourceId, { complete: false });
      updateSource(midSourceId, { complete: false });
      updateSource(lateSourceId, { complete: false });
      buildAndPublish(SEASON_YEAR);
    }
  });

  it("recording OLP/skins/ace payouts updates the funds and flips skinsPaidOut for the paid pool only", () => {
    const before = financialsPayload();
    expect(before.skinsPaidOut).toEqual({ A: false, B: false });

    insertPayout({
      seasonYear: SEASON_YEAR,
      kind: "OLP",
      paidDate: "2097-07-15",
      amountCents: 500,
      subLeague: "EARLY",
    });
    insertPayout({
      seasonYear: SEASON_YEAR,
      kind: "SKINS",
      paidDate: "2097-08-30",
      amountCents: 1000,
      pool: "A",
    });
    insertPayout({
      seasonYear: SEASON_YEAR,
      kind: "ACE",
      paidDate: "2097-07-20",
      amountCents: 300,
    });

    const after = financialsPayload();
    expect(after.skinsPaidOut).toEqual({ A: true, B: false });
    expect(after.funds.olp.EARLY).toBe(500); // 1000 - 500 payout
    expect(after.funds.skins.A).toBe(3480); // 4480 - 1000 payout
    expect(after.funds.ace).toBe(6700); // 7000 - 300 payout

    const sumFunds =
      after.funds.reserves +
      after.funds.ace +
      after.funds.olp.EARLY +
      after.funds.olp.MID +
      after.funds.olp.LATE +
      after.funds.skins.A +
      after.funds.skins.B;
    expect(after.totalCashCents).toBe(sumFunds);
    expect(after.totalCashCents).toBe(37600);

    const last = after.ledger[after.ledger.length - 1]!;
    expect(last.runningTotalCents).toBe(after.totalCashCents);
  });

  it("empty pre-season: zeroed funds, empty ledger, projected true", () => {
    dbInsertSeason(EMPTY_SEASON_YEAR);
    buildAndPublish(EMPTY_SEASON_YEAR);
    const view = getPublished(EMPTY_SEASON_YEAR, "financials");
    expect(view).toBeDefined();
    const payload = view!.payload as PublicFinancialsPayload;

    expect(payload.funds).toEqual({
      reserves: 0,
      ace: 0,
      olp: { EARLY: 0, MID: 0, LATE: 0 },
      skins: { A: 0, B: 0 },
    });
    expect(payload.totalCashCents).toBe(0);
    expect(payload.ledger).toEqual([]);
    expect(payload.totals).toEqual({ tagSales: 0, paidEntries: 0, aceEntries: 0 });
    expect(payload.subLeagueComplete).toEqual({ EARLY: false, MID: false, LATE: false });
    expect(payload.skinsPaidOut).toEqual({ A: false, B: false });
    expect(payload.projected).toBe(true);
  });

  it("includes the financials view in buildViews output", () => {
    const views = buildViews(SEASON_YEAR);
    const financials = views.find((v) => v.viewKey === "financials");
    expect(financials).toBeDefined();
  });
});
