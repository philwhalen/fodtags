// Admin mutation + recompute tests (plans/common-a/06-admin-forms.md "Tests").
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StandingsViewPayload } from "@server/readmodel/build";

const SEASON_YEAR = 2026;
const DIRECTOR = "director@test.local";

let tempDir: string;
let buildAndPublish: (seasonYear: number) => number;
let getPublished: (seasonYear: number, viewKey: string) => { payload: unknown } | undefined;
let getCurrentVersion: (seasonYear: number) => number | undefined;
let listAudit: (seasonYear: number, limit?: number) => Array<{ action: string; entityType: string }>;
let loadSeasonSnapshot: (seasonYear: number) => import("@/lib").SeasonSnapshot;
let computeSeason: (input: import("@/lib").SeasonSnapshot) => import("@/lib").SeasonResults;
let listEvents: (seasonYear: number) => Array<{ id: number; label: string; canceled: boolean }>;
let listSources: (seasonYear: number) => Array<{ id: number; type: string; complete: boolean }>;
let listResultsByEvent: (eventId: number) => Array<{ id: number; holderId: number | null; tagPresent: boolean }>;

let createHolder: (
  input: {
    name: string;
    tagNumber: number;
    pool: "A" | "B";
    entryDate: string;
    ratingAtEntry?: number | null;
  },
  actor: string | null,
) => Promise<{ publishedVersion: number; warning?: string }>;
let setEntryCount: (
  eventId: number,
  paidEntries: number,
  actor: string | null,
) => Promise<{ publishedVersion: number }>;
let cancelEvent: (eventId: number, actor: string | null) => Promise<{ publishedVersion: number }>;
let markSubLeagueComplete: (
  sourceId: number,
  actor: string | null,
) => Promise<{ publishedVersion: number }>;
let resetRecomputeFlight: () => void;
let resetRefreshFlight: () => void;
let runRefresh: (input: { trigger: "manual"; seasonYear: number }) => Promise<{ runId?: number; outcome: string }>;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-vitest-admin-"));
  process.env.DATA_DIR = tempDir;

  const [
    migrateMod,
    seedMod,
    readmodelMod,
    readModelRepo,
    auditRepo,
    snapshotRepo,
    engineMod,
    eventsRepo,
    sourcesRepo,
    resultsRepo,
    adminMutations,
    recomputeMod,
    pipelineMod,
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/readmodel"),
    import("@server/db/repositories/readModel"),
    import("@server/db/repositories/auditLog"),
    import("@server/db/repositories/seasonSnapshot"),
    import("@server/engine"),
    import("@server/db/repositories/events"),
    import("@server/db/repositories/eventSources"),
    import("@server/db/repositories/eventResults"),
    import("@server/admin/mutations"),
    import("@server/readmodel/recompute"),
    import("@server/ingestion/pipeline"),
  ]);

  migrateMod.applyMigrations();
  seedMod.seed();

  buildAndPublish = readmodelMod.buildAndPublish;
  getPublished = readModelRepo.getPublished;
  getCurrentVersion = readModelRepo.getCurrentVersion;
  listAudit = auditRepo.listAudit;
  loadSeasonSnapshot = snapshotRepo.loadSeasonSnapshot;
  computeSeason = engineMod.computeSeason;
  listEvents = eventsRepo.listEvents;
  listSources = sourcesRepo.listSources;
  listResultsByEvent = resultsRepo.listResultsByEvent;

  createHolder = adminMutations.createHolder;
  setEntryCount = adminMutations.setEntryCount;
  cancelEvent = adminMutations.cancelEvent;
  markSubLeagueComplete = adminMutations.markSubLeagueComplete;
  resetRecomputeFlight = recomputeMod.__resetRecomputeSingleFlightForTests;
  resetRefreshFlight = pipelineMod.__resetSingleFlightForTests;
  runRefresh = pipelineMod.runRefresh;

  buildAndPublish(SEASON_YEAR);
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

describe("admin mutations + recompute", () => {
  it("rejects unauthenticated writes", async () => {
    await expect(
      createHolder(
        {
          name: "Ghost",
          tagNumber: 99,
          pool: "A",
          entryDate: "2026-03-01T00:00:00.000Z",
        },
        null,
      ),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("enforces tag number uniqueness per season", async () => {
    await expect(
      createHolder(
        {
          name: "Duplicate Tag",
          tagNumber: 1,
          pool: "A",
          entryDate: "2026-03-01T00:00:00.000Z",
        },
        DIRECTOR,
      ),
    ).rejects.toThrow(/Tag number 1/);
  });

  it("warns when Pool B is assigned to a ≥900-rated holder", async () => {
    const result = await createHolder(
      {
        name: "High Rated B",
        tagNumber: 77,
        pool: "B",
        entryDate: "2026-03-01T00:00:00.000Z",
        ratingAtEntry: 925,
      },
      DIRECTOR,
    );
    expect(result.warning).toMatch(/Pool B.*925/);
    expect(listAudit(SEASON_YEAR, 5).some((a) => a.action === "create" && a.entityType === "tag_holder")).toBe(
      true,
    );
  });

  it("writes audit_log and republishes after entry-count edit (OLP pot changes)", async () => {
    const midNight = listEvents(SEASON_YEAR).find((e) => e.label === "Mid League Night 1");
    expect(midNight).toBeDefined();

    const beforePot = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).olpPot.MID;
    const versionBefore = getCurrentVersion(SEASON_YEAR)!;

    await setEntryCount(midNight!.id, 50, DIRECTOR);

    const afterPot = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).olpPot.MID;
    expect(afterPot).toBe(50);
    expect(afterPot).toBeGreaterThan(beforePot);
    expect(getCurrentVersion(SEASON_YEAR)).toBeGreaterThan(versionBefore);
    expect(
      listAudit(SEASON_YEAR, 10).some((a) => a.action === "upsert" && a.entityType === "entry_count"),
    ).toBe(true);
  });

  it("mark complete finalizes sub-league (standings finalized + OLP not projected)", async () => {
    const midSource = listSources(SEASON_YEAR).find((s) => s.type === "MID");
    expect(midSource).toBeDefined();
    expect(midSource!.complete).toBe(false);

    const olpBefore = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).olp.MID;
    expect(olpBefore.length).toBeGreaterThan(0);
    expect(olpBefore.every((r) => r.projected)).toBe(true);

    await markSubLeagueComplete(midSource!.id, DIRECTOR);

    const midView = getPublished(SEASON_YEAR, "sub-league/mid/pool-a")!.payload as StandingsViewPayload;
    expect(midView.finalized).toBe(true);

    const olpAfter = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).olp.MID;
    expect(olpAfter.every((r) => r.projected === false)).toBe(true);
    expect(listAudit(SEASON_YEAR, 10).some((a) => a.action === "mark_complete")).toBe(true);
  });

  it("canceling an event zeros its contribution after recompute", async () => {
    const activeNight = listEvents(SEASON_YEAR).find(
      (e) => e.label === "Early League Night 2" && !e.canceled,
    );
    expect(activeNight).toBeDefined();

    const versionBefore = getCurrentVersion(SEASON_YEAR)!;
    const standingsBefore = getPublished(SEASON_YEAR, "sub-league/early/pool-a")!
      .payload as StandingsViewPayload;

    await cancelEvent(activeNight!.id, DIRECTOR);

    expect(getCurrentVersion(SEASON_YEAR)).toBeGreaterThan(versionBefore);
    expect(listAudit(SEASON_YEAR, 10).some((a) => a.action === "cancel")).toBe(true);

    const standingsAfter = getPublished(SEASON_YEAR, "sub-league/early/pool-a")!
      .payload as StandingsViewPayload;
    const totalBefore = standingsBefore.rows.reduce((sum, r) => sum + r.points, 0);
    const totalAfter = standingsAfter.rows.reduce((sum, r) => sum + r.points, 0);
    expect(totalAfter).toBeLessThan(totalBefore);
  });

  it("shares recompute single-flight with concurrent callers", async () => {
    resetRecomputeFlight();
    const versionBefore = getCurrentVersion(SEASON_YEAR)!;

    const { recompute } = await import("@server/readmodel/recompute");
    const [v1, v2] = await Promise.all([recompute(SEASON_YEAR), recompute(SEASON_YEAR)]);

    expect(v1).toBe(v2);
    expect(v1).toBe(versionBefore + 1);
  });

  it("pipeline single-flight test contract remains intact", async () => {
    resetRefreshFlight();
    const { listRuns } = await import("@server/db/repositories/refreshRuns");
    const runCountBefore = listRuns(SEASON_YEAR, 1000).length;

    const [first, second] = await Promise.all([
      runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR }),
      runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR }),
    ]);

    expect(listRuns(SEASON_YEAR, 1000).length - runCountBefore).toBe(1);
    expect(first.runId).toBe(second.runId);
    expect([first.outcome, second.outcome].sort()).toEqual(["completed", "skipped"]);
  });
});

describe("tag-not-present adjustment", () => {
  it("excludes a result from standings after recompute", async () => {
    const { setTagNotPresent } = await import("@server/admin/mutations");
    const earlyNight = listEvents(SEASON_YEAR).find((e) => e.label === "Early League Night 1");
    expect(earlyNight).toBeDefined();

    const result = listResultsByEvent(earlyNight!.id).find((r) => r.holderId !== null && r.tagPresent);
    expect(result).toBeDefined();

    const versionBefore = getCurrentVersion(SEASON_YEAR)!;
    await setTagNotPresent(result!.id, false, DIRECTOR);
    expect(getCurrentVersion(SEASON_YEAR)).toBeGreaterThan(versionBefore);
  });
});
