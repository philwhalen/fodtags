// Per-source resilience (sub-plan 08): transient fetch failure is isolated,
// last-good rows kept, source marked stale, run succeeds with runError.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RunRefreshInput, RunRefreshSummary } from "@server/ingestion/pipeline";
import type { PdgaSource } from "@server/ingestion/pdga/source";

const SEASON_YEAR = 2026;
const FIXTURE_PDGA = "104527";
const FAIL_PDGA = "FAIL-FETCH";

let tempDir: string;
let runRefresh: (input: RunRefreshInput) => Promise<RunRefreshSummary>;
let resetSingleFlight: () => void;
let setPdgaSource: (source: PdgaSource | null) => void;
let listSources: (
  seasonYear: number,
) => Array<{ id: number; type: string; pdgaEventId: string; stale: boolean; lastGoodAt: string | null }>;
let updateSource: (id: number, patch: { active?: boolean; pdgaEventId?: string }) => void;
let insertSource: (input: {
  seasonYear: number;
  pdgaEventId: string;
  type: "TOURNAMENT";
  label: string;
  active?: boolean;
  divisions?: string[];
}) => number;
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
let listEvents: (seasonYear: number) => Array<{ id: number; eventSourceId: number }>;
let listResultsByEvent: (eventId: number) => unknown[];
let listRuns: (
  seasonYear: number,
  limit?: number,
) => Array<{ status: string; error: string | null; counts: unknown }>;
let getCurrentVersion: (seasonYear: number) => number | undefined;

let earlySourceId: number;
let tournamentSourceId: number;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-resilience-"));
  process.env.DATA_DIR = tempDir;
  process.env.PDGA_SOURCE = "fixture";

  const [
    { applyMigrations },
    { seed },
    pipeline,
    pdgaMod,
    eventSourcesRepo,
    tagHoldersRepo,
    eventsRepo,
    eventResultsRepo,
    refreshRunsRepo,
    readModelRepo,
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/ingestion/pipeline"),
    import("@server/ingestion/pdga"),
    import("@server/db/repositories/eventSources"),
    import("@server/db/repositories/tagHolders"),
    import("@server/db/repositories/events"),
    import("@server/db/repositories/eventResults"),
    import("@server/db/repositories/refreshRuns"),
    import("@server/db/repositories/readModel"),
  ]);

  runRefresh = pipeline.runRefresh;
  resetSingleFlight = pipeline.__resetSingleFlightForTests;
  setPdgaSource = pdgaMod.__setPdgaSourceForTests;
  listSources = eventSourcesRepo.listSources;
  updateSource = eventSourcesRepo.updateSource;
  insertSource = eventSourcesRepo.insertSource;
  insertHolder = tagHoldersRepo.insertHolder;
  listEvents = eventsRepo.listEvents;
  listResultsByEvent = eventResultsRepo.listResultsByEvent;
  listRuns = refreshRunsRepo.listRuns;
  getCurrentVersion = readModelRepo.getCurrentVersion;

  applyMigrations();
  seed();

  for (const source of listSources(SEASON_YEAR)) {
    if (source.type === "MID" || source.type === "LATE") {
      updateSource(source.id, { active: false });
    }
    if (source.type === "EARLY" && source.pdgaEventId === FIXTURE_PDGA) {
      earlySourceId = source.id;
    }
  }

  insertHolder({
    seasonYear: SEASON_YEAR,
    name: "Anthony D'Aiuto",
    tagNumber: 7,
    pool: "A",
    entryDate: "2026-01-15T00:00:00.000Z",
    pdgaNumber: 211843,
    ratingAtEntry: 952,
    pdgaMembership: true,
  });

  tournamentSourceId = insertSource({
    seasonYear: SEASON_YEAR,
    pdgaEventId: FIXTURE_PDGA,
    type: "TOURNAMENT",
    label: "Resilience test tournament",
    active: true,
    divisions: ["MA1"],
  });

  const { fixtureSource } = await import("@server/ingestion/pdga/fixture-source");
  setPdgaSource({
    async fetchEvent(eventId: string) {
      if (eventId === FAIL_PDGA) {
        throw new Error("fetch timeout simulated");
      }
      return fixtureSource.fetchEvent(eventId);
    },
  });
});

afterAll(async () => {
  setPdgaSource(null);
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

describe("resilience: per-source transient failure", () => {
  it("keeps last-good rows, marks source stale, publishes other sources, run succeeds with runError", async () => {
    resetSingleFlight();
    const goodRun = await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });
    expect(goodRun.status).toBe("succeeded");

    const tournamentEventsBefore = listEvents(SEASON_YEAR).filter(
      (e) => e.eventSourceId === tournamentSourceId,
    );
    expect(tournamentEventsBefore.length).toBeGreaterThan(0);
    const resultCountBefore = tournamentEventsBefore.reduce(
      (n, e) => n + listResultsByEvent(e.id).length,
      0,
    );
    expect(resultCountBefore).toBeGreaterThan(0);

    const tournamentBefore = listSources(SEASON_YEAR).find((s) => s.id === tournamentSourceId)!;
    expect(tournamentBefore.stale).toBe(false);
    expect(tournamentBefore.lastGoodAt).toBeTruthy();

    updateSource(tournamentSourceId, { pdgaEventId: FAIL_PDGA });

    resetSingleFlight();
    const versionBefore = getCurrentVersion(SEASON_YEAR) ?? 0;
    const partialRun = await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    expect(partialRun.status).toBe("succeeded");
    expect(partialRun.error).toMatch(/1\/2 source\(s\) failed/);
    expect(partialRun.publishedVersion).toBeGreaterThan(versionBefore);

    const earlyOutcome = partialRun.sources.find((s) => s.pdgaEventId === FIXTURE_PDGA && s.type === "EARLY");
    expect(earlyOutcome?.status).toBe("ok");

    const failedOutcome = partialRun.sources.find((s) => s.pdgaEventId === FAIL_PDGA);
    expect(failedOutcome?.status).toBe("failed");

    const tournamentAfter = listSources(SEASON_YEAR).find((s) => s.id === tournamentSourceId)!;
    expect(tournamentAfter.stale).toBe(true);

    const earlyAfter = listSources(SEASON_YEAR).find((s) => s.id === earlySourceId)!;
    expect(earlyAfter.stale).toBe(false);

    const tournamentEventsAfter = listEvents(SEASON_YEAR).filter(
      (e) => e.eventSourceId === tournamentSourceId,
    );
    expect(tournamentEventsAfter).toHaveLength(tournamentEventsBefore.length);
    const resultCountAfter = tournamentEventsAfter.reduce(
      (n, e) => n + listResultsByEvent(e.id).length,
      0,
    );
    expect(resultCountAfter).toBe(resultCountBefore);

    const [latestRun] = listRuns(SEASON_YEAR, 1);
    expect(latestRun?.status).toBe("succeeded");
    expect(latestRun?.error).toMatch(/1\/2 source\(s\) failed/);
  });
});
