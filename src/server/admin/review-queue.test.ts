// Admin review queue integration test (sub-plan 06): unmatched fixture
// entrant → list/link/mark-non-holder → sticky + back-fill + read model.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RunRefreshInput, RunRefreshSummary } from "@server/ingestion/pipeline";
import type { StandingsViewPayload } from "@server/readmodel/build";

const SEASON_YEAR = 2026;
const MATCHED_PDGA = 211843;
const UNMATCHED_PDGA = 125890;
const NON_HOLDER_PDGA = 216896;
const ACTOR = "director@test.example";

let tempDir: string;
let runRefresh: (input: RunRefreshInput) => Promise<RunRefreshSummary>;
let resetSingleFlight: () => void;
let listSources: (seasonYear: number) => Array<{ id: number; type: string; pdgaEventId: string }>;
let updateSource: (id: number, patch: { active?: boolean }) => void;
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
let listHolders: (seasonYear: number) => Array<{ id: number; name: string; pdgaNumber: number | null }>;
let listResultsBySeason: (
  seasonYear: number,
) => Array<{ pdgaNumber: number | null; holderId: number | null }>;
let listPendingForQueue: (seasonYear: number) => Array<{
  pdgaNumber: number;
  displayName: string;
  appearanceCount: number;
}>;
let countPending: (seasonYear: number) => number;
let getMatch: (seasonYear: number, pdgaNumber: number) => unknown;
let listAudit: (seasonYear: number, limit?: number) => Array<{ action: string; entityType: string }>;
let linkEntrant: (
  pdgaNumber: number,
  holderId: number,
  actorEmail: string | null,
) => Promise<{ publishedVersion: number }>;
let markNonHolder: (
  pdgaNumber: number,
  actorEmail: string | null,
) => Promise<{ publishedVersion: number }>;
let loadSeasonSnapshot: (seasonYear: number) => import("@/lib").SeasonSnapshot;
let computeSeason: (snapshot: import("@/lib").SeasonSnapshot) => import("@/lib").SeasonResults;
let getPublished: (
  seasonYear: number,
  viewKey: string,
) => { payload: unknown } | undefined;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-review-queue-"));
  process.env.DATA_DIR = tempDir;
  process.env.PDGA_SOURCE = "fixture";

  const [
    { applyMigrations },
    { seed },
    pipeline,
    eventSourcesRepo,
    tagHoldersRepo,
    eventResultsRepo,
    playerMatchesRepo,
    auditLogRepo,
    adminMutations,
    seasonSnapshotRepo,
    engine,
    readModelRepo,
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/ingestion/pipeline"),
    import("@server/db/repositories/eventSources"),
    import("@server/db/repositories/tagHolders"),
    import("@server/db/repositories/eventResults"),
    import("@server/db/repositories/playerMatches"),
    import("@server/db/repositories/auditLog"),
    import("@server/admin/mutations"),
    import("@server/db/repositories/seasonSnapshot"),
    import("@server/engine/season"),
    import("@server/db/repositories/readModel"),
  ]);

  runRefresh = pipeline.runRefresh;
  resetSingleFlight = pipeline.__resetSingleFlightForTests;
  listSources = eventSourcesRepo.listSources;
  updateSource = eventSourcesRepo.updateSource;
  insertHolder = tagHoldersRepo.insertHolder;
  listHolders = tagHoldersRepo.listHolders;
  listResultsBySeason = eventResultsRepo.listResultsBySeason;
  listPendingForQueue = playerMatchesRepo.listPendingForQueue;
  countPending = playerMatchesRepo.countPending;
  getMatch = playerMatchesRepo.getMatch;
  listAudit = auditLogRepo.listAudit;
  linkEntrant = adminMutations.linkEntrant;
  markNonHolder = adminMutations.markNonHolder;
  loadSeasonSnapshot = seasonSnapshotRepo.loadSeasonSnapshot;
  computeSeason = engine.computeSeason;
  getPublished = readModelRepo.getPublished;

  applyMigrations();
  seed();

  for (const source of listSources(SEASON_YEAR)) {
    if (source.type === "MID" || source.type === "LATE") {
      updateSource(source.id, { active: false });
    }
  }

  insertHolder({
    seasonYear: SEASON_YEAR,
    name: "Anthony D'Aiuto",
    tagNumber: 7,
    pool: "A",
    entryDate: "2026-01-15T00:00:00.000Z",
    pdgaNumber: MATCHED_PDGA,
    ratingAtEntry: 952,
    pdgaMembership: true,
  });

  // Sub-plan 03 (auto-add): a PDGA#-having entrant with zero name hits is
  // no longer "unmatched" — it auto-adds as a provisional holder on
  // refresh (see match.ts/pipeline.ts). Every other real entrant in the
  // 104527 fixture besides "Anthony D'Aiuto" above falls in exactly that
  // bucket, so this suite's admin-queue coverage (linkEntrant/
  // markNonHolder against a genuinely UNRESOLVED entrant) needs at least
  // one real fixture name forced into the surviving "ambiguous" (2+ name
  // hits) unmatched category instead. Two synthetic holders sharing "Josh
  // Goheen"'s normalized name do that for `UNMATCHED_PDGA` without
  // otherwise changing this test's expectations (appearanceCount etc. come
  // from `event_results`, unaffected by which holders share the name).
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

  // Likewise, force a SECOND real fixture entrant ("Jonathan Svendsen")
  // permanently ambiguous — untouched by any mutation in this file — so
  // `countPending`/`pendingReview` still has something to count after the
  // Goheen/Diefes flows below resolve their own entrants.
  insertHolder({
    seasonYear: SEASON_YEAR,
    name: "Jonathan Svendsen",
    tagNumber: null,
    pool: "A",
    entryDate: "2026-01-15T00:00:00.000Z",
    pdgaNumber: null,
    ratingAtEntry: null,
    pdgaMembership: false,
  });
  insertHolder({
    seasonYear: SEASON_YEAR,
    name: "Jonathan Svendsen",
    tagNumber: null,
    pool: "A",
    entryDate: "2026-01-15T00:00:00.000Z",
    pdgaNumber: null,
    ratingAtEntry: null,
    pdgaMembership: false,
  });
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

async function ingestFixture() {
  resetSingleFlight();
  const summary = await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });
  expect(summary.status).toBe("succeeded");
}

describe("review queue: fixture unmatched entrant", () => {
  it("lists unmatched entrant after ingest with appearance count", async () => {
    await ingestFixture();

    const pending = listPendingForQueue(SEASON_YEAR);
    const josh = pending.find((e) => e.pdgaNumber === UNMATCHED_PDGA);
    expect(josh).toBeDefined();
    expect(josh!.displayName).toBe("Josh Goheen");
    expect(josh!.appearanceCount).toBe(7);
    expect(countPending(SEASON_YEAR)).toBeGreaterThan(0);
  });

  it("linkEntrant back-fills results, sticks, audits, scores, and survives refresh", async () => {
    await ingestFixture();

    const alex = listHolders(SEASON_YEAR).find((h) => h.name === "Alex Rivera");
    expect(alex).toBeDefined();

    await linkEntrant(UNMATCHED_PDGA, alex!.id, ACTOR);

    const linkedRows = listResultsBySeason(SEASON_YEAR).filter(
      (r) => r.pdgaNumber === UNMATCHED_PDGA,
    );
    expect(linkedRows.length).toBe(7);
    expect(linkedRows.every((r) => r.holderId === alex!.id)).toBe(true);

    const sticky = getMatch(SEASON_YEAR, UNMATCHED_PDGA) as {
      holderId: number;
      source: string;
      decidedBy: string;
    };
    expect(sticky.holderId).toBe(alex!.id);
    expect(sticky.source).toBe("admin");
    expect(sticky.decidedBy).toBe(ACTOR);
    expect(listAudit(SEASON_YEAR, 5).some((a) => a.action === "link" && a.entityType === "player_match")).toBe(
      true,
    );

    const snapshot = loadSeasonSnapshot(SEASON_YEAR);
    const results = computeSeason(snapshot);
    const poolAIds = results.championship.A.map((row) => row.holderId);
    expect(poolAIds).toContain(alex!.id);

    resetSingleFlight();
    await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    expect(listPendingForQueue(SEASON_YEAR).some((e) => e.pdgaNumber === UNMATCHED_PDGA)).toBe(false);
    expect(
      listResultsBySeason(SEASON_YEAR)
        .filter((r) => r.pdgaNumber === UNMATCHED_PDGA)
        .every((r) => r.holderId === alex!.id),
    ).toBe(true);
  });

  it("markNonHolder removes entrant from queue permanently with holderId=null", async () => {
    await ingestFixture();

    await markNonHolder(NON_HOLDER_PDGA, ACTOR);

    expect(listPendingForQueue(SEASON_YEAR).some((e) => e.pdgaNumber === NON_HOLDER_PDGA)).toBe(false);

    const rows = listResultsBySeason(SEASON_YEAR).filter((r) => r.pdgaNumber === NON_HOLDER_PDGA);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.holderId === null)).toBe(true);

    const sticky = getMatch(SEASON_YEAR, NON_HOLDER_PDGA) as { holderId: null; source: string };
    expect(sticky.holderId).toBeNull();
    expect(sticky.source).toBe("admin");

    resetSingleFlight();
    await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });

    expect(listPendingForQueue(SEASON_YEAR).some((e) => e.pdgaNumber === NON_HOLDER_PDGA)).toBe(false);
    expect(
      listResultsBySeason(SEASON_YEAR)
        .filter((r) => r.pdgaNumber === NON_HOLDER_PDGA)
        .every((r) => r.holderId === null),
    ).toBe(true);
  });

  it("reflects countPending in the published read model pendingReview", async () => {
    await ingestFixture();

    const expected = countPending(SEASON_YEAR);
    expect(expected).toBeGreaterThan(0);

    const view = getPublished(SEASON_YEAR, "championship/pool-a");
    expect(view).toBeDefined();
    const payload = view!.payload as StandingsViewPayload;
    expect(payload.pendingReview).toBe(expected);
  });
});
