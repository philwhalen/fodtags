// Auto-add entry-date reconciliation (sub-plan 03 fix, Spec 03 §3.5 "entry
// date = first ingested round"): a brand-new player who appears across TWO
// sub-leagues in one refresh gets their provisional holder created while the
// FIRST source is processed. If that first source is the later-dated
// sub-league (MID here), the holder is initially seeded with a MID entry
// date — but their true first ingested round is in the earlier sub-league
// (EARLY), processed later in the same run. Without the post-loop
// reconciliation the holder's entry date stays too late and sub-league
// eligibility (entry_date <= round date) silently drops every EARLY round.
//
// Mocks the PDGA source (rather than the real fixture) so the two events'
// dates are controlled: MID StartDate 2026-05-21, EARLY StartDate 2026-03-12.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { RunRefreshInput, RunRefreshSummary } from "@server/ingestion/pipeline";

const SEASON_YEAR = 2026;

// Hoisted so the (also-hoisted) vi.mock factory below can build payloads.
// LATER_EVENT is assigned to whichever source is processed FIRST (so the
// holder is created from a later date), EARLIER_EVENT to the one processed
// second — that is the ordering that reproduces the bug.
const stub = vi.hoisted(() => {
  const LATER_EVENT = "700001";
  const EARLIER_EVENT = "700002";
  const NEW_PDGA = 999001;
  const NEW_NAME = "Testy McTester";
  const LATER_START = "2026-05-21";
  const EARLIER_START = "2026-03-12";

  function score(round: number, toPar: number) {
    return {
      PDGANum: NEW_PDGA,
      HasPDGANum: 1,
      Name: NEW_NAME,
      FirstName: "Testy",
      LastName: "McTester",
      RoundtoPar: toPar,
      ToPar: toPar,
      RoundRating: 950,
      Rating: 950,
      Completed: 1,
      HasRoundScore: 1,
      Round: round,
      RunningPlace: 1,
      Tied: false,
      WonPlayoff: "",
      ProfileURL: "",
      Rounds: "",
      Division: "MPO",
    };
  }
  function payload(eventId: string, startDate: string) {
    return {
      pdgaEventId: eventId,
      meta: {
        HighestCompletedRound: 2,
        FinalRound: 2,
        EndDate: startDate,
        DateRange: "Thursdays",
        StartDate: startDate,
      },
      divisions: [],
      rounds: [
        { Division: "MPO", Round: 1, scores: [score(1, -3)] },
        { Division: "MPO", Round: 2, scores: [score(2, -4)] },
      ],
    };
  }
  return { LATER_EVENT, EARLIER_EVENT, NEW_PDGA, NEW_NAME, LATER_START, EARLIER_START, payload };
});

vi.mock("@server/ingestion/pdga", () => ({
  getPdgaSource: () => ({
    async fetchEvent(eventId: string) {
      if (eventId === stub.LATER_EVENT) return stub.payload(stub.LATER_EVENT, stub.LATER_START);
      if (eventId === stub.EARLIER_EVENT) return stub.payload(stub.EARLIER_EVENT, stub.EARLIER_START);
      return {
        pdgaEventId: eventId,
        meta: { HighestCompletedRound: 0, FinalRound: 0, EndDate: "", DateRange: "", StartDate: "" },
        divisions: [],
        rounds: [],
      };
    },
  }),
}));

let tempDir: string;
let runRefresh: (input: RunRefreshInput) => Promise<RunRefreshSummary>;
let resetSingleFlight: () => void;
let listActiveSources: (seasonYear: number) => Array<{ id: number; type: string }>;
let updateSource: (id: number, patch: { active?: boolean; pdgaEventId?: string }) => void;
let listHolders: (seasonYear: number) => Array<{
  id: number;
  pdgaNumber: number | null;
  entryDate: string;
  confirmed: boolean;
}>;
let loadSeasonSnapshot: (seasonYear: number) => import("@/lib").SeasonSnapshot;
let computeSeason: (snapshot: import("@/lib").SeasonSnapshot) => import("@/lib").SeasonResults;

// The sub-league types of the first- and second-processed sources (the earlier
// rounds — and thus the back-dated eligibility — land in `secondType`).
let firstType: "EARLY" | "MID" | "LATE";
let secondType: "EARLY" | "MID" | "LATE";

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-entry-date-"));
  process.env.DATA_DIR = tempDir;
  process.env.PDGA_SOURCE = "stub"; // ignored — getPdgaSource is mocked

  const [{ applyMigrations }, { seed }, pipeline, eventSourcesRepo, tagHoldersRepo, seasonSnapshotRepo, engine] =
    await Promise.all([
      import("@server/db/migrate"),
      import("@server/db/seed"),
      import("@server/ingestion/pipeline"),
      import("@server/db/repositories/eventSources"),
      import("@server/db/repositories/tagHolders"),
      import("@server/db/repositories/seasonSnapshot"),
      import("@server/engine/season"),
    ]);

  runRefresh = pipeline.runRefresh;
  resetSingleFlight = pipeline.__resetSingleFlightForTests;
  listActiveSources = eventSourcesRepo.listActiveSources;
  updateSource = eventSourcesRepo.updateSource;
  listHolders = tagHoldersRepo.listHolders;
  loadSeasonSnapshot = seasonSnapshotRepo.loadSeasonSnapshot;
  computeSeason = engine.computeSeason;

  applyMigrations();
  seed();

  // The unique (season_year, type) index means we reuse the seeded sub-league
  // sources rather than insert new ones. Keep exactly two active and point
  // them at our mocked events. Whichever the pipeline processes FIRST gets the
  // LATER-dated event (so the holder is auto-added with a too-late entry
  // date); the one processed SECOND gets the EARLIER event — reproducing the
  // cross-sub-league bug this fix addresses.
  const [firstActive, secondActive, ...rest] = listActiveSources(SEASON_YEAR);
  for (const source of rest) updateSource(source.id, { active: false });
  firstType = firstActive!.type as "EARLY" | "MID" | "LATE";
  secondType = secondActive!.type as "EARLY" | "MID" | "LATE";
  updateSource(firstActive!.id, { pdgaEventId: stub.LATER_EVENT });
  updateSource(secondActive!.id, { pdgaEventId: stub.EARLIER_EVENT });
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

describe("auto-add entry-date reconciliation across sub-leagues", () => {
  it("back-dates entry date to the earliest ingested round and counts the earlier sub-league", async () => {
    resetSingleFlight();
    const summary = await runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR });
    expect(summary.status).toBe("succeeded");
    // One holder despite the player appearing in two sources this run.
    expect(summary.autoAdded).toBe(1);

    const holder = listHolders(SEASON_YEAR).find((h) => h.pdgaNumber === stub.NEW_PDGA);
    expect(holder).toBeDefined();
    expect(holder!.confirmed).toBe(false);
    // The fix: entry date is back-dated to the EARLIER round, not the later
    // date the holder was first seeded with. Without reconciliation this
    // would be 2026-05-21 and the earlier sub-league would drop his rounds.
    expect(holder!.entryDate).toBe(stub.EARLIER_START);

    // And so the player is counted in BOTH sub-leagues' standings — including
    // the earlier one (`secondType`) whose rounds predate the seeded entry.
    const results = computeSeason(loadSeasonSnapshot(SEASON_YEAR));
    const inFirst = results.subLeagues[firstType].A.some((r) => r.holderId === holder!.id);
    const inSecond = results.subLeagues[secondType].A.some((r) => r.holderId === holder!.id);
    expect(inFirst).toBe(true);
    expect(inSecond).toBe(true);
  });
});
