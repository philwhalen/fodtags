// Financials page integration (plans/financials/04-pages.md).
//
// Asserts the pure composition the `/[season]/financials` server page
// performs: seed -> buildAndPublish -> getPublished("financials") ->
// projectFinancials — plus the empty/pre-publish path the page's early
// return covers. The read-model correctness itself (fund reconciliation,
// chronological ledger, projected/subLeagueComplete/skinsPaidOut flags) is
// already covered exhaustively by financials-build.test.ts — this file's
// job is the page-level composition layer on top of that, following the
// score-sheet-integration.test.ts / olp-integration.test.ts precedent (no
// jsdom/route harness).
//
// Same dynamic-import pattern as build.test.ts / olp-integration.test.ts:
// `@server/config` freezes `process.env` at first import, so `DATA_DIR`
// must be set before any server module loads. `@/lib` (pure, client-safe)
// is imported statically since it has no such dependency.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PublicFinancialsPayload } from "@/lib";
import { projectFinancials } from "@/lib";

// A season year of its own — not the shared 2026 fixture — so this file's
// figures depend only on what it seeds itself (mirrors financials-build
// -test.ts's isolation rationale).
const SEASON_YEAR = 2196;
// Published (buildAndPublish has run) but with zero financial inputs — the
// "zeroed" half of the empty-branch precondition.
const ZEROED_SEASON_YEAR = 2197;
// Never published at all — the true pre-publish state the page's early
// `!published` branch actually renders for.
const NEVER_PUBLISHED_SEASON_YEAR = 2198;

let tempDir: string;
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

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "fodtags-vitest-financials-page-integration-"),
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
    import("@server/db/client"),
    import("@server/db/schema"),
  ]);

  buildAndPublish = readmodel.buildAndPublish;
  getPublished = readModelRepo.getPublished;
  insertSource = eventSourcesRepo.insertSource;
  insertEvent = eventsRepo.insertEvent;
  upsertEntryCount = entryCountsRepo.upsertEntryCount;
  upsertOpenings = financialOpeningsRepo.upsertOpenings;
  insertTagSale = tagSalesRepo.insertTagSale;
  insertExpense = expensesRepo.insertExpense;
  insertPayout = payoutsRepo.insertPayout;
  dbInsertSeason = (year: number) => {
    dbClient.db.insert(schema.seasons).values({ year }).run();
  };

  applyMigrations();

  dbInsertSeason(SEASON_YEAR);

  const earlySourceId = insertSource({
    seasonYear: SEASON_YEAR,
    pdgaEventId: "FIN-PAGE-EARLY",
    type: "EARLY",
    label: "Financials Page Early",
    startDate: "2196-04-01",
    endDate: "2196-05-13",
    complete: false,
  });
  const midSourceId = insertSource({
    seasonYear: SEASON_YEAR,
    pdgaEventId: "FIN-PAGE-MID",
    type: "MID",
    label: "Financials Page Mid",
    startDate: "2196-05-20",
    endDate: "2196-07-01",
    complete: false,
  });
  const lateSourceId = insertSource({
    seasonYear: SEASON_YEAR,
    pdgaEventId: "FIN-PAGE-LATE",
    type: "LATE",
    label: "Financials Page Late",
    startDate: "2196-07-08",
    endDate: "2196-08-26",
    complete: false,
  });

  const earlyEventId = insertEvent({
    seasonYear: SEASON_YEAR,
    eventSourceId: earlySourceId,
    type: "LeagueNight",
    label: "Financials Page Early Night",
    eventDate: "2196-04-15",
    roundOrdinal: 1,
  });
  const midEventId = insertEvent({
    seasonYear: SEASON_YEAR,
    eventSourceId: midSourceId,
    type: "LeagueNight",
    label: "Financials Page Mid Night",
    eventDate: "2196-05-25",
    roundOrdinal: 1,
  });
  const lateEventId = insertEvent({
    seasonYear: SEASON_YEAR,
    eventSourceId: lateSourceId,
    type: "LeagueNight",
    label: "Financials Page Late Night",
    eventDate: "2196-07-10",
    roundOrdinal: 1,
  });

  // Varied paid/ace counts across the three sub-leagues.
  upsertEntryCount({ seasonYear: SEASON_YEAR, eventId: earlyEventId, paidEntries: 12, aceEntries: 9 });
  upsertEntryCount({ seasonYear: SEASON_YEAR, eventId: midEventId, paidEntries: 7, aceEntries: 5 });
  upsertEntryCount({ seasonYear: SEASON_YEAR, eventId: lateEventId, paidEntries: 9, aceEntries: 6 });

  upsertOpenings({ seasonYear: SEASON_YEAR, aceOpeningCents: 4000, reservesOpeningCents: 15000 });
  insertTagSale({ seasonYear: SEASON_YEAR, saleDate: "2196-02-01", count: 4 });
  insertExpense({
    seasonYear: SEASON_YEAR,
    spentDate: "2196-06-15",
    amountCents: 1500,
    category: "trophies",
    description: "Season trophies",
  });

  // OLP + skins + ace payouts so the ledger carries at least one of each
  // payout kind (and the skins-payout row this file asserts a href on).
  insertPayout({
    seasonYear: SEASON_YEAR,
    kind: "OLP",
    paidDate: "2196-07-15",
    amountCents: 600,
    subLeague: "EARLY",
  });
  insertPayout({
    seasonYear: SEASON_YEAR,
    kind: "SKINS",
    paidDate: "2196-08-30",
    amountCents: 1000,
    pool: "A",
  });
  insertPayout({
    seasonYear: SEASON_YEAR,
    kind: "ACE",
    paidDate: "2196-07-20",
    amountCents: 200,
  });

  // A published-but-empty season: buildAndPublish runs, but no financial
  // inputs are ever recorded, so the payload comes back zeroed (per
  // financials-build.test.ts's "empty pre-season" case) rather than the
  // view simply not existing.
  dbInsertSeason(ZEROED_SEASON_YEAR);
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

function financialsPayload(seasonYear: number): PublicFinancialsPayload {
  buildAndPublish(seasonYear);
  const view = getPublished(seasonYear, "financials");
  expect(view).toBeDefined();
  return view!.payload as PublicFinancialsPayload;
}

describe("financials page integration (plans/financials/04-pages.md)", () => {
  it("1. published view shape: non-null, funds present, ledger non-empty, total cash = sum of funds", () => {
    const payload = financialsPayload(SEASON_YEAR);

    expect(payload.ledger.length).toBeGreaterThan(0);

    const sumFunds =
      payload.funds.reserves +
      payload.funds.ace +
      payload.funds.olp.EARLY +
      payload.funds.olp.MID +
      payload.funds.olp.LATE +
      payload.funds.skins.A +
      payload.funds.skins.B;
    expect(payload.totalCashCents).toBe(sumFunds);
  });

  it("2. the page's exact projection: summary total cash = sum of funds", () => {
    const payload = financialsPayload(SEASON_YEAR);
    const { summary } = projectFinancials(payload, SEASON_YEAR);

    const sumFunds =
      payload.funds.reserves +
      payload.funds.ace +
      payload.funds.olp.EARLY +
      payload.funds.olp.MID +
      payload.funds.olp.LATE +
      payload.funds.skins.A +
      payload.funds.skins.B;
    // Format both sides the same way so cents-vs-dollars formatting can't
    // hide a mismatch.
    const expected = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(sumFunds / 100);
    expect(summary.totalCash.amount).toBe(expected);
  });

  it("3. pots: OLP 50-30-20 payouts sum to the pot, for every sub-league", () => {
    const payload = financialsPayload(SEASON_YEAR);
    const { pots } = projectFinancials(payload, SEASON_YEAR);

    expect(pots.olp.length).toBe(3);
    for (const olpPot of pots.olp) {
      const potCents = Math.round(
        Number(olpPot.pot.replace(/[^0-9.-]/g, "")) * 100,
      );
      const payoutCents = olpPot.payouts.reduce(
        (acc, p) => acc + Math.round(Number(p.replace(/[^0-9.-]/g, "")) * 100),
        0,
      );
      expect(payoutCents).toBe(potCents);
    }
  });

  it("4. ledger: a league-night row's split children sum to its net and it links to the sub-league board", () => {
    const payload = financialsPayload(SEASON_YEAR);
    const { ledger } = projectFinancials(payload, SEASON_YEAR);

    const nightRows = ledger.rows.filter((row) => row.kind === "league-night");
    expect(nightRows.length).toBeGreaterThan(0);

    for (const row of nightRows) {
      expect(row.splitChildren).toBeDefined();
      const netCents = Math.round(Number(row.netAmount.replace(/[^0-9.-]/g, "")) * 100);
      const splitSum = row.splitChildren!.reduce(
        (acc, child) => acc + Math.round(Number(child.amount.replace(/[^0-9.-]/g, "")) * 100),
        0,
      );
      expect(splitSum).toBe(netCents);
      expect(row.href).toBeDefined();
      expect(row.href).toMatch(new RegExp(`^/${SEASON_YEAR}/sub-league/(early|mid|late)$`));
    }
  });

  it("5. ledger: the skins-payout row links to that pool's score sheet", () => {
    const payload = financialsPayload(SEASON_YEAR);
    const { ledger } = projectFinancials(payload, SEASON_YEAR);

    const skinsPayoutRows = ledger.rows.filter((row) => row.kind === "skins-payout");
    expect(skinsPayoutRows.length).toBeGreaterThan(0);
    for (const row of skinsPayoutRows) {
      expect(row.href).toMatch(new RegExp(`^/${SEASON_YEAR}/score-sheet/pool-[ab]$`));
    }
    // This fixture recorded a Pool A payout specifically.
    expect(skinsPayoutRows.some((row) => row.href === `/${SEASON_YEAR}/score-sheet/pool-a`)).toBe(
      true,
    );
  });

  it("6. published-but-zeroed pre-season: projects without throwing; summary all $0.00, ledger empty", () => {
    const payload = financialsPayload(ZEROED_SEASON_YEAR);
    expect(payload.ledger).toEqual([]);
    expect(payload.totalCashCents).toBe(0);

    const { summary, ledger } = projectFinancials(payload, ZEROED_SEASON_YEAR);

    expect(summary.totalCash.amount).toBe("$0.00");
    for (const row of summary.fundRows) {
      expect(row.amount).toBe("$0.00");
    }
    expect(ledger.rows).toEqual([]);
  });

  it("7. never-published pre-season: getPublished returns undefined — the page's true empty-branch precondition", () => {
    // Deliberately no dbInsertSeason/buildAndPublish call for this season
    // year — the page's `if (!published)` branch is what actually renders
    // in this state (a bare empty-state note, no projection performed).
    const view = getPublished(NEVER_PUBLISHED_SEASON_YEAR, "financials");
    expect(view).toBeUndefined();
  });
});
