// Persistence write-path integration test (sub-plan 05): fixture source →
// idempotent events/event_results → engine sees ingested holder.
//
// Same dynamic-import pattern as pipeline.test.ts — set DATA_DIR and
// PDGA_SOURCE before any server module loads config.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RunRefreshInput, RunRefreshSummary } from "@server/ingestion/pipeline";

const SEASON_YEAR = 2026;
const FIXTURE_PDGA_NUMBER = 211843;

let tempDir: string;
let runRefresh: (input: RunRefreshInput) => Promise<RunRefreshSummary>;
let resetSingleFlight: () => void;
let listSources: (seasonYear: number) => Array<{ id: number; type: string; pdgaEventId: string }>;
let updateSource: (id: number, patch: { active?: boolean }) => void;
let insertHolder: (input: {
  seasonYear: number;
  name: string;
  tagNumber: number;
  pool: "A" | "B";
  entryDate: string;
  pdgaNumber: number;
  ratingAtEntry: number;
  pdgaMembership: boolean;
}) => number;
let listEvents: (seasonYear: number) => Array<{
  id: number;
  eventSourceId: number;
  roundOrdinal: number | null;
  canceled: boolean;
}>;
let listResultsByEvent: (eventId: number) => Array<{
  id: number;
  pdgaNumber: number | null;
  holderId: number | null;
  rawScoreToPar: number;
  tagPresent: boolean;
}>;
let listResultsBySeason: (seasonYear: number) => unknown[];
let updateEvent: (id: number, patch: { canceled?: boolean }) => void;
let updateResult: (id: number, patch: { tagPresent?: boolean }) => void;
let loadSeasonSnapshot: (seasonYear: number) => import("@/lib").SeasonSnapshot;
let computeSeason: (snapshot: import("@/lib").SeasonSnapshot) => import("@/lib").SeasonResults;
let dbSelectEvents: () => unknown[];
let dbSelectResults: () => unknown[];

let earlySourceId: number;
let fixtureHolderId: number;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-persist-"));
  process.env.DATA_DIR = tempDir;
  process.env.PDGA_SOURCE = "fixture";

  const [
    { applyMigrations },
    { seed },
    pipeline,
    eventSourcesRepo,
    tagHoldersRepo,
    eventsRepo,
    eventResultsRepo,
    seasonSnapshotRepo,
    engine,
    { db },
    { events, eventResults },
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/ingestion/pipeline"),
    import("@server/db/repositories/eventSources"),
    import("@server/db/repositories/tagHolders"),
    import("@server/db/repositories/events"),
    import("@server/db/repositories/eventResults"),
    import("@server/db/repositories/seasonSnapshot"),
    import("@server/engine/season"),
    import("@server/db/client"),
    import("@server/db/schema"),
  ]);

  runRefresh = pipeline.runRefresh;
  resetSingleFlight = pipeline.__resetSingleFlightForTests;
  listSources = eventSourcesRepo.listSources;
  updateSource = eventSourcesRepo.updateSource;
  insertHolder = tagHoldersRepo.insertHolder;
  listEvents = eventsRepo.listEvents;
  listResultsByEvent = eventResultsRepo.listResultsByEvent;
  listResultsBySeason = eventResultsRepo.listResultsBySeason;
  updateEvent = eventsRepo.updateEvent;
  updateResult = eventResultsRepo.updateResult;
  loadSeasonSnapshot = seasonSnapshotRepo.loadSeasonSnapshot;
  computeSeason = engine.computeSeason;
  dbSelectEvents = () => db.select().from(events).all();
  dbSelectResults = () => db.select().from(eventResults).all();

  applyMigrations();
  seed();

  for (const source of listSources(SEASON_YEAR)) {
    if (source.type === "MID" || source.type === "LATE") {
      updateSource(source.id, { active: false });
    }
    if (source.type === "EARLY" && source.pdgaEventId === "104527") {
      earlySourceId = source.id;
    }
  }

  fixtureHolderId = insertHolder({
    seasonYear: SEASON_YEAR,
    name: "Anthony D'Aiuto",
    tagNumber: 7,
    pool: "A",
    entryDate: "2026-01-15T00:00:00.000Z",
    pdgaNumber: FIXTURE_PDGA_NUMBER,
    ratingAtEntry: 952,
    pdgaMembership: true,
  });
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

function earlyEvents() {
  return listEvents(SEASON_YEAR).filter((e) => e.eventSourceId === earlySourceId);
}

function round7Event() {
  const event = earlyEvents().find((e) => e.roundOrdinal === 7);
  expect(event).toBeDefined();
  return event!;
}

describe("persist: fixture source → events/event_results", () => {
  it("writes one LeagueNight per round and links matched holderId", async () => {
    resetSingleFlight();
    const summary = await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    expect(summary.status).toBe("succeeded");
    const earlyOutcome = summary.sources.find((s) => s.pdgaEventId === "104527");
    expect(earlyOutcome?.status).toBe("ok");
    expect(earlyOutcome?.roundsPersisted).toBe(7);

    expect(earlyEvents()).toHaveLength(7);

    const round7Results = listResultsByEvent(round7Event().id);
    expect(round7Results).toHaveLength(12);

    const matchedRow = round7Results.find((r) => r.pdgaNumber === FIXTURE_PDGA_NUMBER);
    expect(matchedRow).toBeDefined();
    expect(matchedRow!.holderId).toBe(fixtureHolderId);
    expect(matchedRow!.rawScoreToPar).toBe(-8);
  });

  it("is idempotent across consecutive refreshes", async () => {
    resetSingleFlight();
    await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    const eventsAfterFirst = dbSelectEvents().length;
    const resultsAfterFirst = dbSelectResults().length;
    const spotRow = listResultsByEvent(round7Event().id).find(
      (r) => r.pdgaNumber === FIXTURE_PDGA_NUMBER,
    );

    resetSingleFlight();
    await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    expect(dbSelectEvents()).toHaveLength(eventsAfterFirst);
    expect(dbSelectResults()).toHaveLength(resultsAfterFirst);

    const spotAfter = listResultsByEvent(round7Event().id).find(
      (r) => r.pdgaNumber === FIXTURE_PDGA_NUMBER,
    );
    expect(spotAfter).toEqual(spotRow);
  });

  it("preserves admin-owned canceled and tagPresent flags", async () => {
    resetSingleFlight();
    await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    const canceledEvent = earlyEvents().find((e) => e.roundOrdinal === 3)!;
    updateEvent(canceledEvent.id, { canceled: true });

    const round7Row = listResultsByEvent(round7Event().id).find(
      (r) => r.pdgaNumber === FIXTURE_PDGA_NUMBER,
    )!;
    updateResult(round7Row.id, { tagPresent: false });

    resetSingleFlight();
    await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    expect(listEvents(SEASON_YEAR).find((e) => e.id === canceledEvent.id)?.canceled).toBe(true);
    expect(
      listResultsByEvent(round7Event().id).find((r) => r.pdgaNumber === FIXTURE_PDGA_NUMBER)
        ?.tagPresent,
    ).toBe(false);
  });

  it("feeds the unchanged engine with non-empty standings for the ingested holder", async () => {
    resetSingleFlight();
    await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    const snapshot = loadSeasonSnapshot(SEASON_YEAR);
    const results = computeSeason(snapshot);
    const poolAIds = results.championship.A.map((row) => row.holderId);

    expect(poolAIds).toContain(fixtureHolderId);
    expect(listResultsBySeason(SEASON_YEAR).length).toBeGreaterThan(0);
  });
});
