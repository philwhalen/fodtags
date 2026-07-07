// Spec 03/10 acceptance suite (sub-plan 08): fixture 104527 end-to-end proof.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RunRefreshInput, RunRefreshSummary } from "@server/ingestion/pipeline";
import type { StandingsViewPayload } from "@server/readmodel/build";

const SEASON_YEAR = 2026;
const FIXTURE_PDGA = "104527";
const FIXTURE_PDGA_NUMBER = 211843;
const UNMATCHED_PDGA = 125890;
const ACTOR = "director@test.example";

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
let listHolders: (seasonYear: number) => Array<{
  id: number;
  name: string;
  pdgaNumber: number | null;
  tagNumber: number | null;
  pool: "A" | "B";
  confirmed: boolean;
  pdgaMembership: boolean;
}>;
let listEvents: (
  seasonYear: number,
) => Array<{ id: number; eventSourceId: number; roundOrdinal: number | null; canceled: boolean }>;
let listResultsBySeason: (
  seasonYear: number,
) => Array<{ id: number; eventId: number; pdgaNumber: number | null; holderId: number | null }>;
let listPendingForQueue: (seasonYear: number) => Array<{ pdgaNumber: number }>;
let linkEntrant: (
  pdgaNumber: number,
  holderId: number,
  actorEmail: string | null,
) => Promise<{ publishedVersion: number }>;
let updateEvent: (id: number, patch: { canceled?: boolean }) => void;
let loadSeasonSnapshot: (seasonYear: number) => import("@/lib").SeasonSnapshot;
let computeSeason: (snapshot: import("@/lib").SeasonSnapshot) => import("@/lib").SeasonResults;
let getCurrentVersion: (seasonYear: number) => number | undefined;
let getPublished: (
  seasonYear: number,
  viewKey: string,
) => { payload: unknown; version: number } | undefined;
let listRuns: (
  seasonYear: number,
  limit?: number,
) => Array<{ id: number; status: string; trigger: string; counts: unknown }>;

let fixtureHolderId: number;
let earlySourceId: number;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-acceptance-"));
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
    playerMatchesRepo,
    adminMutations,
    seasonSnapshotRepo,
    engine,
    readModelRepo,
    refreshRunsRepo,
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/ingestion/pipeline"),
    import("@server/db/repositories/eventSources"),
    import("@server/db/repositories/tagHolders"),
    import("@server/db/repositories/events"),
    import("@server/db/repositories/eventResults"),
    import("@server/db/repositories/playerMatches"),
    import("@server/admin/mutations"),
    import("@server/db/repositories/seasonSnapshot"),
    import("@server/engine/season"),
    import("@server/db/repositories/readModel"),
    import("@server/db/repositories/refreshRuns"),
  ]);

  runRefresh = pipeline.runRefresh;
  resetSingleFlight = pipeline.__resetSingleFlightForTests;
  listSources = eventSourcesRepo.listSources;
  updateSource = eventSourcesRepo.updateSource;
  insertHolder = tagHoldersRepo.insertHolder;
  listHolders = tagHoldersRepo.listHolders;
  listEvents = eventsRepo.listEvents;
  listResultsBySeason = eventResultsRepo.listResultsBySeason;
  listPendingForQueue = playerMatchesRepo.listPendingForQueue;
  linkEntrant = adminMutations.linkEntrant;
  updateEvent = eventsRepo.updateEvent;
  loadSeasonSnapshot = seasonSnapshotRepo.loadSeasonSnapshot;
  computeSeason = engine.computeSeason;
  getCurrentVersion = readModelRepo.getCurrentVersion;
  getPublished = readModelRepo.getPublished;
  listRuns = refreshRunsRepo.listRuns;

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

function publishedPayload(viewKey: string): StandingsViewPayload {
  const row = getPublished(SEASON_YEAR, viewKey);
  expect(row).toBeDefined();
  return row!.payload as StandingsViewPayload;
}

function standingsPayloadForCompare(viewKey: string): string {
  const payload = publishedPayload(viewKey);
  return JSON.stringify({
    rows: payload.rows,
    stale: payload.stale,
    pendingReview: payload.pendingReview,
    finalized: payload.finalized,
  });
}

describe("ingestion acceptance (Spec 03/10)", () => {
  it("fixture 104527 refresh matches players and publishes standings", async () => {
    resetSingleFlight();
    const summary = await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    expect(summary.status).toBe("succeeded");
    expect(summary.publishedVersion).toBeGreaterThan(0);

    const matched = listResultsBySeason(SEASON_YEAR).filter(
      (r) => r.pdgaNumber === FIXTURE_PDGA_NUMBER,
    );
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.every((r) => r.holderId === fixtureHolderId)).toBe(true);

    const poolA = publishedPayload("championship/pool-a");
    expect(poolA.rows.some((row) => row.playerId === fixtureHolderId)).toBe(true);
  });

  it("scheduled path produces identical published payload to manual Refresh now", async () => {
    resetSingleFlight();
    await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });
    const manualPoolA = standingsPayloadForCompare("championship/pool-a");
    const manualPoolB = standingsPayloadForCompare("championship/pool-b");
    const versionAfterManual = getCurrentVersion(SEASON_YEAR)!;

    resetSingleFlight();
    await runRefresh({ trigger: "scheduled", seasonYear: SEASON_YEAR });

    expect(getCurrentVersion(SEASON_YEAR)).toBeGreaterThan(versionAfterManual);
    expect(standingsPayloadForCompare("championship/pool-a")).toBe(manualPoolA);
    expect(standingsPayloadForCompare("championship/pool-b")).toBe(manualPoolB);
  });

  it("brand-new PDGA entrant auto-adds as a provisional holder, scores immediately, and a director can still override the link", async () => {
    resetSingleFlight();
    await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    // Sub-plan 03 (auto-add): a PDGA#-having entrant with zero name hits is
    // no longer queued as "unmatched" — it auto-adds as a provisional tag
    // holder on the very refresh that first sees it (Spec 03 §3.5/§3.6).
    const goheen = listHolders(SEASON_YEAR).find((h) => h.pdgaNumber === UNMATCHED_PDGA);
    expect(goheen).toBeDefined();
    expect(goheen!.confirmed).toBe(false);
    expect(goheen!.tagNumber).toBeNull();
    expect(goheen!.pool).toBe("A");
    expect(goheen!.pdgaMembership).toBe(true);

    expect(listPendingForQueue(SEASON_YEAR).some((e) => e.pdgaNumber === UNMATCHED_PDGA)).toBe(
      false,
    );

    const goheenRows = listResultsBySeason(SEASON_YEAR).filter(
      (r) => r.pdgaNumber === UNMATCHED_PDGA,
    );
    expect(goheenRows.length).toBeGreaterThan(0);
    expect(goheenRows.every((r) => r.holderId === goheen!.id)).toBe(true);

    const beforeLink = computeSeason(loadSeasonSnapshot(SEASON_YEAR));
    const scoredHolderIds = new Set([
      ...beforeLink.championship.A.map((row) => row.holderId),
      ...beforeLink.championship.B.map((row) => row.holderId),
    ]);
    expect(scoredHolderIds.has(goheen!.id)).toBe(true);

    // A director can still override an auto-add by re-linking the PDGA# to
    // a different (existing) holder — `linkEntrant` doesn't care whether
    // the PDGA# already resolved via auto-add; admin always wins.
    const alex = listHolders(SEASON_YEAR).find((h) => h.name === "Alex Rivera")!;
    await linkEntrant(UNMATCHED_PDGA, alex.id, ACTOR);

    const afterLink = computeSeason(loadSeasonSnapshot(SEASON_YEAR));
    expect(afterLink.championship.A.some((row) => row.holderId === alex.id)).toBe(true);

    resetSingleFlight();
    await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    // Sticky: re-running never re-creates the provisional holder or
    // re-queues the entrant, and the admin override survives the refresh.
    expect(
      listHolders(SEASON_YEAR).filter((h) => h.pdgaNumber === UNMATCHED_PDGA).length,
    ).toBe(1);
    expect(listPendingForQueue(SEASON_YEAR).some((e) => e.pdgaNumber === UNMATCHED_PDGA)).toBe(
      false,
    );
    expect(
      listResultsBySeason(SEASON_YEAR)
        .filter((r) => r.pdgaNumber === UNMATCHED_PDGA)
        .every((r) => r.holderId === alex.id),
    ).toBe(true);
  });

  it("published standings trace to eventSource, round, and refresh run", async () => {
    resetSingleFlight();
    await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    const [latestRun] = listRuns(SEASON_YEAR, 1);
    expect(latestRun?.status).toBe("succeeded");
    const counts = latestRun?.counts as { publishedVersion?: number } | null;
    expect(counts?.publishedVersion).toBe(getCurrentVersion(SEASON_YEAR));

    const events = listEvents(SEASON_YEAR);
    const eventById = new Map(events.map((e) => [e.id, e]));
    const results = listResultsBySeason(SEASON_YEAR);

    const poolA = publishedPayload("championship/pool-a");
    for (const row of poolA.rows.filter((r) => r.points > 0)) {
      const holderResults = results.filter((r) => r.holderId === row.playerId);
      expect(holderResults.length).toBeGreaterThan(0);

      for (const result of holderResults) {
        const event = eventById.get(result.eventId)!;
        expect(event.eventSourceId).toBeGreaterThan(0);
        expect(event.roundOrdinal).toBeGreaterThan(0);
        if (event.eventSourceId === earlySourceId) {
          expect(event.roundOrdinal).toBeLessThanOrEqual(7);
        }
      }
    }
  });

  it("canceled League Night stays zeroed after refresh", async () => {
    resetSingleFlight();
    await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    const canceledNight = listEvents(SEASON_YEAR).find(
      (e) => e.eventSourceId === earlySourceId && e.roundOrdinal === 3,
    )!;
    updateEvent(canceledNight.id, { canceled: true });

    const snapshotBefore = loadSeasonSnapshot(SEASON_YEAR);
    const alex = listHolders(SEASON_YEAR).find((h) => h.name === "Alex Rivera")!;
    const pointsBefore = computeSeason(snapshotBefore).championship.A.find(
      (row) => row.holderId === alex.id,
    )?.totalPoints;

    resetSingleFlight();
    await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    const stillCanceled = listEvents(SEASON_YEAR).find((e) => e.id === canceledNight.id);
    expect(stillCanceled?.canceled).toBe(true);

    const snapshotAfter = loadSeasonSnapshot(SEASON_YEAR);
    const canceledInSnapshot = snapshotAfter.events.find((e) => e.roundOrdinal === 3);
    expect(canceledInSnapshot?.canceled).toBe(true);

    const pointsAfter = computeSeason(snapshotAfter).championship.A.find(
      (row) => row.holderId === alex.id,
    )?.totalPoints;
    expect(pointsAfter).toBe(pointsBefore);
  });
});
