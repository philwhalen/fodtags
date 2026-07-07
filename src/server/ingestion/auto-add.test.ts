// Auto-add pipeline integration test (sub-plan 03, Spec 03 §3.5/§3.6):
// brand-new PDGA entrant -> provisional tag holder, created ONLY in the
// ingestion pipeline, never re-created on re-run, and never duplicated
// when the same player appears in two active sources within one run.
//
// Same dynamic-import pattern as pipeline.test.ts / persist.test.ts — set
// DATA_DIR and PDGA_SOURCE before any server module loads config.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RunRefreshInput, RunRefreshSummary } from "@server/ingestion/pipeline";

const SEASON_YEAR = 2026;
const FIXTURE_PDGA = "104527";

// Real entrants from the 104527 fixture (see match.ts / ingestion-acceptance
// test for the full roster). None of these names collide with `seed()`'s
// synthetic roster, so — absent the forced-ambiguous holders inserted below
// for `GOHEEN_PDGA` — they all land in `match()`'s `autoAdds` bucket.
const DIEFES_PDGA = 216896; // "Michael Diefes", 7 appearances
const GOHEEN_PDGA = 125890; // "Josh Goheen", 7 appearances — forced ambiguous below
const COLOTTI_PDGA = 242744; // "Brian Colotti", 7 appearances — used for the cross-source test

let tempDir: string;
let runRefresh: (input: RunRefreshInput) => Promise<RunRefreshSummary>;
let resetSingleFlight: () => void;
let listSources: (seasonYear: number) => Array<{ id: number; type: string; pdgaEventId: string }>;
let updateSource: (id: number, patch: { active?: boolean }) => void;
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
  tagNumber: number | null;
  pool: "A" | "B";
  entryDate: string;
  pdgaNumber: number | null;
  ratingAtEntry: number | null;
  pdgaMembership: boolean;
}) => number;
let listHolders: (seasonYear: number) => Array<{
  id: number;
  name: string;
  pdgaNumber: number | null;
  tagNumber: number | null;
  pool: "A" | "B";
  entryDate: string;
  ratingAtEntry: number | null;
  confirmed: boolean;
  pdgaMembership: boolean;
}>;
let listEvents: (
  seasonYear: number,
) => Array<{ id: number; eventSourceId: number; roundOrdinal: number | null; eventDate: string }>;
let listResultsBySeason: (
  seasonYear: number,
) => Array<{ eventId: number; pdgaNumber: number | null; holderId: number | null }>;
let listPendingForQueue: (seasonYear: number) => Array<{ pdgaNumber: number }>;
let getMatch: (
  seasonYear: number,
  pdgaNumber: number,
) => { holderId: number | null; source: string; decidedBy: string } | undefined;
let listMatches: (
  seasonYear: number,
) => Array<{ pdgaNumber: number; holderId: number | null; source: string }>;
let listAuditLog: (
  seasonYear: number,
  options?: { entityType?: string; limit?: number },
) => Array<{ action: string; entityType: string; entityId: string; actorEmail: string }>;
let listRuns: (
  seasonYear: number,
  limit?: number,
) => Array<{ counts: unknown }>;
let loadSeasonSnapshot: (seasonYear: number) => import("@/lib").SeasonSnapshot;
let computeSeason: (snapshot: import("@/lib").SeasonSnapshot) => import("@/lib").SeasonResults;

let earlySourceId: number;
let tournamentSourceId: number;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-auto-add-"));
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
    auditLogRepo,
    refreshRunsRepo,
    seasonSnapshotRepo,
    engine,
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/ingestion/pipeline"),
    import("@server/db/repositories/eventSources"),
    import("@server/db/repositories/tagHolders"),
    import("@server/db/repositories/events"),
    import("@server/db/repositories/eventResults"),
    import("@server/db/repositories/playerMatches"),
    import("@server/db/repositories/auditLog"),
    import("@server/db/repositories/refreshRuns"),
    import("@server/db/repositories/seasonSnapshot"),
    import("@server/engine/season"),
  ]);

  runRefresh = pipeline.runRefresh;
  resetSingleFlight = pipeline.__resetSingleFlightForTests;
  listSources = eventSourcesRepo.listSources;
  updateSource = eventSourcesRepo.updateSource;
  insertSource = eventSourcesRepo.insertSource;
  insertHolder = tagHoldersRepo.insertHolder;
  listHolders = tagHoldersRepo.listHolders;
  listEvents = eventsRepo.listEvents;
  listResultsBySeason = eventResultsRepo.listResultsBySeason;
  listPendingForQueue = playerMatchesRepo.listPendingForQueue;
  getMatch = playerMatchesRepo.getMatch;
  listMatches = playerMatchesRepo.listMatches;
  listAuditLog = auditLogRepo.listAuditLog;
  listRuns = refreshRunsRepo.listRuns;
  loadSeasonSnapshot = seasonSnapshotRepo.loadSeasonSnapshot;
  computeSeason = engine.computeSeason;

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

  // Force "Josh Goheen" permanently ambiguous (2+ name hits) so the
  // surviving unmatched category — the one `match()` still can't
  // auto-resolve — has a real fixture entrant to exercise.
  for (let i = 0; i < 2; i++) {
    insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Josh Goheen",
      tagNumber: null,
      pool: "A",
      entryDate: "2026-01-15T00:00:00.000Z",
      pdgaNumber: null,
      ratingAtEntry: null,
      pdgaMembership: false,
    });
  }

  // A SECOND active source pointed at the SAME PDGA event id, present from
  // the very first refresh below — every entrant in the 104527 fixture
  // (including brand-new ones) appears TWICE within that one `runRefresh`
  // call, across two different sources. This is the cross-source-in-a-
  // single-run hazard (Spec 03 §3.5): without the in-run holders/stickyMap
  // injection, the second source would auto-add a SECOND holder for the
  // same real player instead of auto-linking to the one the first source
  // just created.
  tournamentSourceId = insertSource({
    seasonYear: SEASON_YEAR,
    pdgaEventId: FIXTURE_PDGA,
    type: "TOURNAMENT",
    label: "Auto-add cross-source test tournament",
    active: true,
    divisions: ["MA1"],
  });
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

function earlyRound1EventDate(): string {
  const round1 = listEvents(SEASON_YEAR).find(
    (e) => e.eventSourceId === earlySourceId && e.roundOrdinal === 1,
  );
  expect(round1).toBeDefined();
  return round1!.eventDate;
}

describe("auto-add pipeline (sub-plan 03)", () => {
  // A single shared refresh (both the EARLY source and the cross-source
  // TOURNAMENT duplicate of the same fixture are active from `beforeAll`)
  // seeds the state every `it` below inspects — mirroring how one refresh
  // run is the unit of atomicity in production (Spec 03 §3.7).
  it("auto-adds a brand-new PDGA entrant as a provisional holder, attributes results, scores, and reports the count", async () => {
    resetSingleFlight();
    const summary = await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    expect(summary.status).toBe("succeeded");
    expect(summary.autoAdded).toBeGreaterThan(0);

    const [latestRun] = listRuns(SEASON_YEAR, 1);
    expect((latestRun?.counts as { autoAdded?: number })?.autoAdded).toBe(summary.autoAdded);

    const diefes = listHolders(SEASON_YEAR).find((h) => h.pdgaNumber === DIEFES_PDGA);
    expect(diefes).toBeDefined();
    expect(diefes!.confirmed).toBe(false);
    expect(diefes!.tagNumber).toBeNull();
    expect(diefes!.pool).toBe("A");
    expect(diefes!.pdgaMembership).toBe(true);
    expect(diefes!.entryDate).toBe(earlyRound1EventDate());

    const diefesResults = listResultsBySeason(SEASON_YEAR).filter(
      (r) => r.pdgaNumber === DIEFES_PDGA,
    );
    expect(diefesResults.length).toBeGreaterThan(0);
    expect(diefesResults.every((r) => r.holderId === diefes!.id)).toBe(true);

    const results = computeSeason(loadSeasonSnapshot(SEASON_YEAR));
    const poolAIds = results.championship.A.map((row) => row.holderId);
    expect(poolAIds).toContain(diefes!.id);

    const sticky = getMatch(SEASON_YEAR, DIEFES_PDGA);
    expect(sticky?.holderId).toBe(diefes!.id);
    expect(sticky?.source).toBe("auto");
    expect(sticky?.decidedBy).toBe("auto");

    const audit = listAuditLog(SEASON_YEAR, { entityType: "tag_holder" });
    expect(
      audit.some(
        (a) => a.action === "auto_add" && a.actorEmail === "system" && a.entityId === String(diefes!.id),
      ),
    ).toBe(true);
  });

  it("creates exactly one holder when the same new PDGA entrant appears in two active sources in the same run", () => {
    // Both the EARLY and TOURNAMENT sources point at fixture 104527 and
    // were BOTH active for the single refresh the previous test ran, so
    // "Brian Colotti" (COLOTTI_PDGA) appeared twice in that one run.
    const colottiHolders = listHolders(SEASON_YEAR).filter((h) => h.pdgaNumber === COLOTTI_PDGA);
    expect(colottiHolders).toHaveLength(1);
    const colottiHolder = colottiHolders[0]!;

    const colottiMatches = listMatches(SEASON_YEAR).filter((m) => m.pdgaNumber === COLOTTI_PDGA);
    expect(colottiMatches).toHaveLength(1);
    expect(colottiMatches[0]?.source).toBe("auto");

    const earlyEventIds = new Set(
      listEvents(SEASON_YEAR)
        .filter((e) => e.eventSourceId === earlySourceId)
        .map((e) => e.id),
    );
    const tournamentEventIds = new Set(
      listEvents(SEASON_YEAR)
        .filter((e) => e.eventSourceId === tournamentSourceId)
        .map((e) => e.id),
    );

    const colottiResults = listResultsBySeason(SEASON_YEAR).filter(
      (r) => r.pdgaNumber === COLOTTI_PDGA,
    );
    // Both this source's and the tournament's events attributed the SAME
    // holder — no unique-constraint throw, no second holder created.
    expect(colottiResults.every((r) => r.holderId === colottiHolder.id)).toBe(true);
    expect(colottiResults.some((r) => earlyEventIds.has(r.eventId))).toBe(true);
    expect(colottiResults.some((r) => tournamentEventIds.has(r.eventId))).toBe(true);
  });

  it("keeps an ambiguous (2+ name hits) entrant queued instead of auto-adding", () => {
    expect(listPendingForQueue(SEASON_YEAR).some((e) => e.pdgaNumber === GOHEEN_PDGA)).toBe(true);
    expect(listHolders(SEASON_YEAR).some((h) => h.pdgaNumber === GOHEEN_PDGA)).toBe(false);
  });

  it("is sticky on re-run: running again creates no new holder and no duplicate match row", async () => {
    const holderCountBefore = listHolders(SEASON_YEAR).filter(
      (h) => h.pdgaNumber === DIEFES_PDGA,
    ).length;
    const matchCountBefore = listMatches(SEASON_YEAR).filter(
      (m) => m.pdgaNumber === DIEFES_PDGA,
    ).length;
    expect(holderCountBefore).toBe(1);
    expect(matchCountBefore).toBe(1);

    resetSingleFlight();
    const summary = await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    // Everyone auto-addable already resolved by the earlier run (both
    // sources' entrants are all sticky now) — nothing left to auto-add.
    expect(summary.autoAdded).toBe(0);
    expect(
      listHolders(SEASON_YEAR).filter((h) => h.pdgaNumber === DIEFES_PDGA).length,
    ).toBe(holderCountBefore);
    expect(
      listMatches(SEASON_YEAR).filter((m) => m.pdgaNumber === DIEFES_PDGA).length,
    ).toBe(matchCountBefore);
  });
});
