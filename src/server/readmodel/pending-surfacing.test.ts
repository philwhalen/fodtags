// Sub-plan 06 end-to-end integration test (Spec 04 §4.4, Spec 08 §8.1/§8.3,
// Spec 11 §11.2): a brand-new PDGA entrant auto-added during `runRefresh`
// must surface as `provisional`/tagless in the PUBLISHED read model — the
// players index row, the profile payload, and the pending-review count —
// and flip to confirmed once a director calls `confirmHolder`. No new
// engine/read-model computation is exercised here; this only proves the
// chunk-02/03/04 payload plumbing reaches the public read side (the actual
// component rendering is covered by the component files themselves — this
// is the "prove the whole loop" test the sub-plan calls for).
//
// Same isolated-temp-DB / dynamic-import pattern as auto-add.test.ts and
// provisional-holders.test.ts — DATA_DIR + PDGA_SOURCE must be set before
// any server module loads config.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RunRefreshInput, RunRefreshSummary } from "@server/ingestion/pipeline";
import type { PlayersIndexRow, PublicPlayersIndexPayload, PublicProfilePayload } from "@/lib";
import type { PublicStandingsViewPayload } from "@/lib";

const SEASON_YEAR = 2026;
const DIRECTOR = "director@test.example";

// Real entrant from the 104527 fixture with no name collision against
// `seed()`'s synthetic roster, so it lands in `match()`'s `autoAdds` bucket
// on the very first refresh (see auto-add.test.ts for the full roster).
const DIEFES_PDGA = 216896; // "Michael Diefes"
const CONFIRMED_TAG_NUMBER = 777;

let tempDir: string;
let runRefresh: (input: RunRefreshInput) => Promise<RunRefreshSummary>;
let resetSingleFlight: () => void;
let listSources: (seasonYear: number) => Array<{ id: number; type: string; pdgaEventId: string }>;
let updateSource: (id: number, patch: { active?: boolean }) => void;
let getPublished: (
  seasonYear: number,
  viewKey: string,
) => { payload: unknown } | undefined;
let confirmHolder: (
  input: { id: number; pool: "A" | "B"; tagNumber?: number | null },
  actorEmail: string | null,
) => Promise<{ publishedVersion: number; warning?: string }>;
let getHolder: (id: number) => { tagNumber: number | null; currentTagNumber: number | null } | undefined;
let loadSeasonSnapshot: (seasonYear: number) => import("@/lib").SeasonSnapshot;
let computeSeason: (snapshot: import("@/lib").SeasonSnapshot) => import("@/lib").SeasonResults;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-pending-surfacing-"));
  process.env.DATA_DIR = tempDir;
  process.env.PDGA_SOURCE = "fixture";

  const [
    { applyMigrations },
    { seed },
    pipeline,
    eventSourcesRepo,
    readModelRepo,
    adminMutations,
    tagHoldersRepo,
    seasonSnapshotRepo,
    engine,
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/ingestion/pipeline"),
    import("@server/db/repositories/eventSources"),
    import("@server/db/repositories/readModel"),
    import("@server/admin/mutations"),
    import("@server/db/repositories/tagHolders"),
    import("@server/db/repositories/seasonSnapshot"),
    import("@server/engine"),
  ]);

  runRefresh = pipeline.runRefresh;
  resetSingleFlight = pipeline.__resetSingleFlightForTests;
  listSources = eventSourcesRepo.listSources;
  updateSource = eventSourcesRepo.updateSource;
  getPublished = readModelRepo.getPublished;
  confirmHolder = adminMutations.confirmHolder;
  getHolder = tagHoldersRepo.getHolder;
  loadSeasonSnapshot = seasonSnapshotRepo.loadSeasonSnapshot;
  computeSeason = engine.computeSeason;

  applyMigrations();
  seed();

  // Only the EARLY source (pointed at the real 104527 fixture) stays
  // active — mirrors auto-add.test.ts's isolation of the auto-add signal.
  for (const source of listSources(SEASON_YEAR)) {
    if (source.type === "MID" || source.type === "LATE") {
      updateSource(source.id, { active: false });
    }
  }
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

describe("public pending-confirmation surfacing (sub-plan 06)", () => {
  it("publishes a brand-new auto-added entrant as provisional/tagless, scored, with the pending count reflecting it — then flips to confirmed after confirmHolder", async () => {
    resetSingleFlight();
    const summary = await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });
    expect(summary.status).toBe("succeeded");
    expect(summary.autoAdded).toBeGreaterThan(0);

    // 1. Published `players` index carries the new holder, provisional and
    // tagless, and the pending-review count includes them.
    const indexPublished = getPublished(SEASON_YEAR, "players");
    expect(indexPublished).toBeDefined();
    const indexPayload = indexPublished!.payload as PublicPlayersIndexPayload;

    const diefesRow = indexPayload.holders.find(
      (row: PlayersIndexRow) => row.pdgaNumber === DIEFES_PDGA,
    );
    expect(diefesRow).toBeDefined();
    expect(diefesRow!.provisional).toBe(true);
    expect(diefesRow!.tagNumber).toBeNull();
    expect(indexPayload.pendingReview).toBeGreaterThanOrEqual(1);

    // 2. The holder appears (scored) in the published Championship, Pool A
    // standings — provisional holders score immediately (Plan decision).
    const championshipPublished = getPublished(SEASON_YEAR, "championship/pool-a");
    expect(championshipPublished).toBeDefined();
    const championshipPayload = championshipPublished!.payload as PublicStandingsViewPayload;
    expect(
      championshipPayload.rows.some((row) => row.playerId === diefesRow!.holderId),
    ).toBe(true);

    // 3. The holder's own published profile payload is also provisional.
    const profilePublished = getPublished(SEASON_YEAR, `players/${diefesRow!.slug}`);
    expect(profilePublished).toBeDefined();
    const profilePayload = profilePublished!.payload as PublicProfilePayload;
    expect(profilePayload.provisional).toBe(true);
    expect(profilePayload.tagNumber).toBeNull();
    expect(profilePayload.holderId).toBe(diefesRow!.holderId);

    const pendingBefore = indexPayload.pendingReview;

    // 4. Director confirms the holder (pool + tag number) -> republish.
    const result = await confirmHolder(
      { id: diefesRow!.holderId, pool: "A", tagNumber: CONFIRMED_TAG_NUMBER },
      DIRECTOR,
    );
    expect(result.publishedVersion).toBeGreaterThan(0);

    // The admin-assigned number lands as the holder's INITIAL (stable) tag
    // — the roster/slug seed (Spec 02 §2.10 architecture decision 1).
    const holderRow = getHolder(diefesRow!.holderId);
    expect(holderRow?.tagNumber).toBe(CONFIRMED_TAG_NUMBER);

    // But the PUBLISHED (current) tag is the engine's tag timeline output,
    // which can legitimately differ from the just-assigned initial tag:
    // Diefes already had League Night results before confirmation
    // (provisional holders score immediately), so once their initial tag
    // seeds the timeline, the full-season recompute retroactively folds
    // them into the combined-field reassignment pile on every night they
    // already played (Spec 02 §2.10 "the engine treats it as the seed of
    // the timeline" — tag-reassignment sub-plan 04 is the first read-model
    // consumer to surface this). Cross-check against the engine's own
    // `currentTagByHolder` rather than hardcoding a number here, so this
    // assertion doesn't silently drift out of sync with the engine.
    const expectedCurrentTag = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).currentTagByHolder[
      diefesRow!.holderId
    ];
    expect(expectedCurrentTag).not.toBeNull();

    const indexPublishedAfter = getPublished(SEASON_YEAR, "players");
    const indexPayloadAfter = indexPublishedAfter!.payload as PublicPlayersIndexPayload;
    const diefesRowAfter = indexPayloadAfter.holders.find(
      (row: PlayersIndexRow) => row.holderId === diefesRow!.holderId,
    );
    expect(diefesRowAfter).toBeDefined();
    expect(diefesRowAfter!.provisional).toBe(false);
    expect(diefesRowAfter!.tagNumber).toBe(expectedCurrentTag);
    expect(indexPayloadAfter.pendingReview).toBe(pendingBefore - 1);

    const profilePublishedAfter = getPublished(SEASON_YEAR, `players/${diefesRowAfter!.slug}`);
    expect(profilePublishedAfter).toBeDefined();
    const profilePayloadAfter = profilePublishedAfter!.payload as PublicProfilePayload;
    expect(profilePayloadAfter.provisional).toBe(false);
    expect(profilePayloadAfter.tagNumber).toBe(expectedCurrentTag);
  });
});
