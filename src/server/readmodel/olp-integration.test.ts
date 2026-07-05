// OLP standings page integration (plans/olp-pot/04-pages.md).
//
// Asserts the pure composition the `/[season]/olp/[league]` server page
// performs: seed -> buildAndPublish -> getPublished("olp/<league>") ->
// projectOlp — plus the `/olp` alias's redirect target via
// getCurrentSubLeagueSlug. Follows the rounds-integration.test.ts /
// leaderboard-integration.test.ts precedent (no jsdom/route harness); the
// eligibility/pot/stale wiring itself is already covered by build.test.ts's
// "read model: OLP view" describe — this file's job is the page-level
// composition (projectOlp over the published payload, and the alias).
//
// Same dynamic-import pattern as build.test.ts / leaderboard-integration.test.ts:
// `@server/config` freezes `process.env` at first import, so `DATA_DIR`
// must be set before any server module loads. `@/lib` (pure, client-safe)
// is imported statically since it has no such dependency.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { projectOlp } from "@/lib";
import type { PublicOlpPayload } from "@/lib";
import type { SubLeagueSlug } from "@/lib/public-routes";

const SEASON_YEAR = 2026;

let tempDir: string;
let buildAndPublish: (seasonYear: number) => number;
let getPublished: (
  seasonYear: number,
  viewKey: string,
) => { payload: unknown } | undefined;
let getCurrentSubLeagueSlug: (seasonYear: number) => SubLeagueSlug | null;
let listHolders: (
  seasonYear: number,
) => { id: number; name: string; pdgaMembership: boolean }[];
let listSources: (seasonYear: number) => { id: number; type: string }[];
let updateSource: (id: number, patch: { complete?: boolean }) => void;
let insertEvent: (input: {
  seasonYear: number;
  eventSourceId: number;
  type: "LeagueNight";
  label: string;
  eventDate: string;
  roundOrdinal: number;
}) => number;
let insertResult: (input: {
  seasonYear: number;
  eventId: number;
  displayName: string;
  holderId?: number | null;
  rawScoreToPar: number;
}) => number;
let upsertEntryCount: (input: {
  seasonYear: number;
  eventId: number;
  paidEntries: number;
}) => void;

let alexId: number;
let samId: number;
let morganId: number;
let midSourceId: number;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-vitest-olp-integration-"));
  process.env.DATA_DIR = tempDir;

  const [
    { applyMigrations },
    { seed },
    readmodel,
    readModelRepo,
    currentSubLeague,
    tagHoldersRepo,
    eventSourcesRepo,
    eventsRepo,
    resultsRepo,
    entryCountsRepo,
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/readmodel"),
    import("@server/db/repositories/readModel"),
    import("@server/readmodel/currentSubLeague"),
    import("@server/db/repositories/tagHolders"),
    import("@server/db/repositories/eventSources"),
    import("@server/db/repositories/events"),
    import("@server/db/repositories/eventResults"),
    import("@server/db/repositories/entryCounts"),
  ]);

  buildAndPublish = readmodel.buildAndPublish;
  getPublished = readModelRepo.getPublished;
  getCurrentSubLeagueSlug = currentSubLeague.getCurrentSubLeagueSlug;
  listHolders = tagHoldersRepo.listHolders;
  listSources = eventSourcesRepo.listSources;
  updateSource = eventSourcesRepo.updateSource;
  insertEvent = eventsRepo.insertEvent;
  insertResult = resultsRepo.insertResult;
  upsertEntryCount = entryCountsRepo.upsertEntryCount;

  applyMigrations();
  seed();

  const holders = listHolders(SEASON_YEAR);
  alexId = holders.find((h) => h.name === "Alex Rivera")!.id; // pdgaMembership: true
  samId = holders.find((h) => h.name === "Sam Patel")!.id; // pdgaMembership: false
  morganId = holders.find((h) => h.name === "Morgan Kim")!.id; // pdgaMembership: true
  midSourceId = listSources(SEASON_YEAR).find((s) => s.type === "MID")!.id;

  // The seed fixture already gives MID one League Night (round 1) with
  // Alex (-3) and Morgan (2); Sam has no seeded MID round. Add 4 more MID
  // League Nights with Alex + Sam only (never Morgan), so: Alex reaches 5
  // rounds with PDGA membership (eligible); Sam reaches 4 rounds WITHOUT
  // PDGA membership (not-eligible: "no PDGA"); Morgan stays at her seeded 1
  // MID round (not-eligible: "1 round") — the same three eligibility
  // branches build.test.ts's "read model: OLP view" describe exercises,
  // reproduced here standalone since this file seeds its own temp DB.
  for (const roundOrdinal of [2, 3, 4, 5]) {
    const eventId = insertEvent({
      seasonYear: SEASON_YEAR,
      eventSourceId: midSourceId,
      type: "LeagueNight",
      label: `Mid League Night ${roundOrdinal}`,
      eventDate: `2026-05-${20 + roundOrdinal}`,
      roundOrdinal,
    });
    insertResult({
      seasonYear: SEASON_YEAR,
      eventId,
      holderId: alexId,
      displayName: "Alex Rivera",
      rawScoreToPar: -1,
    });
    insertResult({
      seasonYear: SEASON_YEAR,
      eventId,
      holderId: samId,
      displayName: "Sam Patel",
      rawScoreToPar: 2,
    });
    upsertEntryCount({ seasonYear: SEASON_YEAR, eventId, paidEntries: 5 });
  }
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

afterEach(() => {
  vi.useRealTimers();
});

function midPayload(): PublicOlpPayload {
  buildAndPublish(SEASON_YEAR);
  const view = getPublished(SEASON_YEAR, "olp/mid");
  expect(view).toBeDefined();
  return view!.payload as PublicOlpPayload;
}

describe("OLP standings page integration (plans/olp-pot/04-pages.md)", () => {
  it("publishes olp/mid and projectOlp yields the expected eligible/not-eligible split with reasons", () => {
    const payload = midPayload();
    const projection = projectOlp(payload);

    expect(projection.ranked.map((r) => r.holderId)).toEqual([alexId]);
    expect(projection.ranked[0]!.displayRank).toBe(1);
    expect(projection.ranked[0]!.ineligibleReason).toBeUndefined();

    const byHolder = new Map(projection.notEligible.map((r) => [r.holderId, r]));
    expect(byHolder.get(samId)?.ineligibleReason).toBe("no PDGA");
    expect(byHolder.get(morganId)?.ineligibleReason).toBe("1 round");
    expect(projection.notEligible.every((r) => r.displayRank === null)).toBe(true);
  });

  it("pot equals seeded entries; projected flips false on completion + republish, payout amounts unchanged", () => {
    const before = midPayload();
    // Seed's Mid League Night 1 (5) + the 4 rounds added above (5 each) = 25.
    expect(before.pot).toBe(25);
    expect(before.projected).toBe(true);

    const projectionBefore = projectOlp(before);
    const payoutBefore = projectionBefore.ranked[0]!.payout;

    updateSource(midSourceId, { complete: true });
    try {
      const after = midPayload();
      expect(after.pot).toBe(25);
      expect(after.projected).toBe(false);

      const projectionAfter = projectOlp(after);
      expect(projectionAfter.ranked[0]!.payout).toBe(payoutBefore);
    } finally {
      updateSource(midSourceId, { complete: false });
      buildAndPublish(SEASON_YEAR);
    }
  });

  it("alias target: getCurrentSubLeagueSlug resolves for a seeded window and the redirect string follows", () => {
    // Seed windows (src/server/db/seed.ts): EARLY 2026-04-01..2026-05-13
    // (complete), MID 2026-05-20..2026-07-01, LATE 2026-07-08..2026-08-26.
    // 2026-07-04 falls in the gap after MID ends and before LATE starts, so
    // current resolves to the just-ended sub-league: MID (same fixed date
    // used by leaderboard-integration.test.ts for the same reason).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-04T12:00:00-04:00"));

    buildAndPublish(SEASON_YEAR);
    const slug = getCurrentSubLeagueSlug(SEASON_YEAR);
    expect(slug).toBe("mid");

    const current = slug ?? "early";
    expect(`/${SEASON_YEAR}/olp/${current}`).toBe(`/${SEASON_YEAR}/olp/mid`);
  });

  it("alias target: a pre-season fixed date resolves current to early", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00-05:00"));

    buildAndPublish(SEASON_YEAR);
    const slug = getCurrentSubLeagueSlug(SEASON_YEAR);
    expect(slug).toBe("early");

    const current = slug ?? "early";
    expect(`/${SEASON_YEAR}/olp/${current}`).toBe(`/${SEASON_YEAR}/olp/early`);
  });

  it("empty/no-rounds sub-league (LATE) publishes an olp view whose projection is empty", () => {
    buildAndPublish(SEASON_YEAR);
    const view = getPublished(SEASON_YEAR, "olp/late");
    expect(view).toBeDefined();
    const payload = view!.payload as PublicOlpPayload;

    expect(payload.rows).toEqual([]);
    expect(payload.pot).toBe(0);

    const projection = projectOlp(payload);
    expect(projection.ranked).toEqual([]);
    expect(projection.notEligible).toEqual([]);
  });
});
