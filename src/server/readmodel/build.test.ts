// Read-model build + publish tests (plans/common-a/04-readmodel.md "Tests"):
// the seed fixture -> `buildAndPublish` -> `getPublished` returns correct
// non-zero standings for both pools and a sub-league (with tie-break flags
// and freshness metadata); a forced mid-transaction failure leaves the
// published pointer unmoved (atomicity); and a second publish bumps the
// version.
//
// Same dynamic-import pattern as src/server/ingestion/pipeline.test.ts (see
// that file's header): `@server/config` freezes `process.env` at first
// import, so `DATA_DIR` must be set before any server module loads.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StandingsViewPayload, SubLeagueMetaPayload, ViewRow } from "@server/readmodel/build";
import type { PublicRoundsPayload } from "@/lib";

const SEASON_YEAR = 2026;

let tempDir: string;
let buildViews: (seasonYear: number) => ViewRow[];
let publish: (seasonYear: number, views: ViewRow[]) => number;
let buildAndPublish: (seasonYear: number) => number;
let getCurrentVersion: (seasonYear: number) => number | undefined;
let getPublished: (
  seasonYear: number,
  viewKey: string,
) => { payload: unknown } | undefined;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-vitest-readmodel-"));
  process.env.DATA_DIR = tempDir;

  const [{ applyMigrations }, { seed }, readmodel, readModelRepo] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/readmodel"),
    import("@server/db/repositories/readModel"),
  ]);

  buildViews = readmodel.buildViews;
  publish = readmodel.publish;
  buildAndPublish = readmodel.buildAndPublish;
  getCurrentVersion = readModelRepo.getCurrentVersion;
  getPublished = readModelRepo.getPublished;

  applyMigrations();
  seed();
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

describe("read model: build -> publish -> read", () => {
  it("publishes Championship + sub-league standings from the seed fixture", () => {
    const version = buildAndPublish(SEASON_YEAR);
    expect(version).toBeGreaterThanOrEqual(1);
    expect(getCurrentVersion(SEASON_YEAR)).toBe(version);

    for (const pool of ["a", "b"] as const) {
      const view = getPublished(SEASON_YEAR, `championship/pool-${pool}`);
      expect(view).toBeDefined();
      const payload = view!.payload as StandingsViewPayload;

      // Non-empty, contiguously ranked 1..n, and points weakly descending
      // (Spec 04 §4.2 ordering — the engine's own fixtures pin exact totals).
      expect(payload.rows.length).toBeGreaterThan(0);
      payload.rows.forEach((row, i) => {
        expect(row.rank).toBe(i + 1);
        expect(row.pool).toBe(pool.toUpperCase());
        expect(typeof row.tieBrokenByTag).toBe("boolean");
        if (i > 0) {
          expect(payload.rows[i - 1]!.points).toBeGreaterThanOrEqual(row.points);
        }
      });

      // Freshness metadata is stamped here, not in the pure engine.
      expect(typeof payload.updatedAt).toBe("string");
      expect(payload.stale).toBe(false);
      expect(payload.pendingReview).toBe(0);
      // Championship views carry no `finalized` (sub-league-only) flag.
      expect(payload.finalized).toBeUndefined();
    }

    // Real computation happened somewhere in Pool A (EARLY is seeded
    // complete with results, so its Podium is folded in).
    const poolA = getPublished(SEASON_YEAR, "championship/pool-a")!
      .payload as StandingsViewPayload;
    expect(poolA.rows.some((row) => row.points > 0)).toBe(true);
  });

  it("marks a completed sub-league's standings finalized", () => {
    // EARLY is seeded `complete: true`; MID is not (see src/server/db/seed.ts).
    const early = getPublished(SEASON_YEAR, "sub-league/early/pool-a");
    expect(early).toBeDefined();
    expect((early!.payload as StandingsViewPayload).finalized).toBe(true);

    const mid = getPublished(SEASON_YEAR, "sub-league/mid/pool-a");
    expect(mid).toBeDefined();
    expect((mid!.payload as StandingsViewPayload).finalized).toBe(false);
  });

  it("leaves the published pointer unmoved when a publish throws mid-transaction", () => {
    const versionBefore = getCurrentVersion(SEASON_YEAR);
    expect(versionBefore).toBeDefined();
    const poolABefore = getPublished(SEASON_YEAR, "championship/pool-a");
    expect(poolABefore).toBeDefined();

    // A duplicated view row collides with the read_model unique index
    // `(seasonYear, version, viewKey)` on its second insert — throwing
    // partway through the single publish transaction.
    const views = buildViews(SEASON_YEAR);
    expect(() => publish(SEASON_YEAR, [...views, views[0]!])).toThrow();

    // The pointer never advanced and the live view is byte-for-byte the
    // pre-failure payload — readers never saw the partial write.
    expect(getCurrentVersion(SEASON_YEAR)).toBe(versionBefore);
    expect(getPublished(SEASON_YEAR, "championship/pool-a")).toEqual(poolABefore);
  });

  it("publishes a sub-leagues meta view matching the seed's windows", () => {
    // EARLY complete 2026-04-01..2026-05-13; MID 2026-05-20..2026-07-01;
    // LATE 2026-07-08..2026-08-26 (src/server/db/seed.ts).
    const view = getPublished(SEASON_YEAR, "sub-leagues");
    expect(view).toBeDefined();
    const payload = view!.payload as SubLeagueMetaPayload;

    expect(typeof payload.updatedAt).toBe("string");
    expect(payload.subLeagues).toEqual([
      { type: "EARLY", startDate: "2026-04-01", endDate: "2026-05-13", complete: true },
      { type: "MID", startDate: "2026-05-20", endDate: "2026-07-01", complete: false },
      { type: "LATE", startDate: "2026-07-08", endDate: "2026-08-26", complete: false },
    ]);
  });

  it("bumps the version on a second publish", () => {
    const before = getCurrentVersion(SEASON_YEAR)!;
    const next = buildAndPublish(SEASON_YEAR);
    expect(next).toBe(before + 1);
    expect(getCurrentVersion(SEASON_YEAR)).toBe(next);
  });
});

describe("read model: rounds view", () => {
  let buildRoundsView: (seasonYear: number) => ViewRow;
  let listHolders: (seasonYear: number) => { id: number; name: string; tagNumber: number; active: boolean }[];
  let listEvents: (seasonYear: number) => { id: number; label: string; canceled: boolean }[];
  let listSources: (seasonYear: number) => { id: number; type: string }[];
  let insertRating: (input: {
    seasonYear: number;
    holderId: number;
    effectiveDate: string;
    rating: number;
    official?: boolean;
  }) => void;
  let insertSource: (input: {
    seasonYear: number;
    pdgaEventId: string;
    type: "TOURNAMENT" | "FOD_OPEN";
    label: string;
  }) => number;
  let insertEvent: (input: {
    seasonYear: number;
    eventSourceId: number;
    type: "Tournament" | "FODOpen";
    label: string;
    eventDate: string;
  }) => number;
  let insertResult: (input: {
    seasonYear: number;
    eventId: number;
    displayName: string;
    holderId?: number | null;
    rawScoreToPar: number;
    roundRating?: number | null;
    pdgaNumber?: number | null;
  }) => number;
  let setSourceStale: (id: number, stale: boolean) => void;

  let alexId: number;
  let samId: number;
  let morganId: number;
  let midLeagueNightEventId: number;
  let earlyLeagueNight3EventId: number;

  beforeAll(async () => {
    const [
      roundsBuild,
      tagHoldersRepo,
      eventsRepo,
      sourcesRepo,
      ratingsRepo,
      resultsRepo,
    ] = await Promise.all([
      import("@server/readmodel/rounds-build"),
      import("@server/db/repositories/tagHolders"),
      import("@server/db/repositories/events"),
      import("@server/db/repositories/eventSources"),
      import("@server/db/repositories/ratingsHistory"),
      import("@server/db/repositories/eventResults"),
    ]);

    buildRoundsView = roundsBuild.buildRoundsView;
    listHolders = tagHoldersRepo.listHolders;
    listEvents = eventsRepo.listEvents;
    listSources = sourcesRepo.listSources;
    insertRating = ratingsRepo.insertRating;
    insertSource = sourcesRepo.insertSource;
    insertEvent = eventsRepo.insertEvent;
    insertResult = resultsRepo.insertResult;
    setSourceStale = sourcesRepo.setSourceStale;

    const holders = listHolders(SEASON_YEAR);
    alexId = holders.find((h) => h.name === "Alex Rivera")!.id;
    samId = holders.find((h) => h.name === "Sam Patel")!.id;
    morganId = holders.find((h) => h.name === "Morgan Kim")!.id;

    const events = listEvents(SEASON_YEAR);
    midLeagueNightEventId = events.find((e) => e.label === "Mid League Night 1")!.id;
    earlyLeagueNight3EventId = events.find((e) => e.label === "Early League Night 3")!.id;

    // Later unofficial row must not override the latest official present rating.
    insertRating({
      seasonYear: SEASON_YEAR,
      holderId: alexId,
      effectiveDate: "2026-05-15",
      rating: 1050,
      official: false,
    });

    // Only-unofficial holder → Unrated (null).
    insertRating({
      seasonYear: SEASON_YEAR,
      holderId: samId,
      effectiveDate: "2026-05-01",
      rating: 940,
      official: false,
    });

    // Two officials → latest effectiveDate wins (815 on 2026-04-14, not 810).
    insertRating({
      seasonYear: SEASON_YEAR,
      holderId: morganId,
      effectiveDate: "2026-03-01",
      rating: 810,
      official: true,
    });

    // Pending round rating on an existing league night.
    insertResult({
      seasonYear: SEASON_YEAR,
      eventId: midLeagueNightEventId,
      holderId: samId,
      displayName: "Sam Patel",
      pdgaNumber: null,
      rawScoreToPar: 4,
      roundRating: null,
    });

    const tourneySourceId = insertSource({
      seasonYear: SEASON_YEAR,
      pdgaEventId: "TEST-TOURNEY-2026",
      type: "TOURNAMENT",
      label: "Test Tournament Source",
    });
    const tourneyEventId = insertEvent({
      seasonYear: SEASON_YEAR,
      eventSourceId: tourneySourceId,
      type: "Tournament",
      label: "Spring Open",
      eventDate: "2026-06-15",
    });
    insertResult({
      seasonYear: SEASON_YEAR,
      eventId: tourneyEventId,
      holderId: alexId,
      displayName: "Alex Rivera",
      pdgaNumber: 123456,
      rawScoreToPar: -6,
      roundRating: 1030,
    });

    const fodSourceId = insertSource({
      seasonYear: SEASON_YEAR,
      pdgaEventId: "TEST-FOD-2026",
      type: "FOD_OPEN",
      label: "Test FOD Open Source",
    });
    const fodEventId = insertEvent({
      seasonYear: SEASON_YEAR,
      eventSourceId: fodSourceId,
      type: "FODOpen",
      label: "FOD Open Round 1",
      eventDate: "2026-08-01",
    });
    insertResult({
      seasonYear: SEASON_YEAR,
      eventId: fodEventId,
      holderId: alexId,
      displayName: "Alex Rivera",
      pdgaNumber: 123456,
      rawScoreToPar: -3,
      roundRating: 1018,
    });

    // Unmatched guest — must not appear under any holder.
    insertResult({
      seasonYear: SEASON_YEAR,
      eventId: midLeagueNightEventId,
      holderId: null,
      displayName: "Guest Player",
      pdgaNumber: 999999,
      rawScoreToPar: 7,
      roundRating: 900,
    });
  });

  function roundsPayload(): PublicRoundsPayload {
    return buildRoundsView(SEASON_YEAR).payload as PublicRoundsPayload;
  }

  function holderByName(name: string) {
    const entry = roundsPayload().holders.find((h) => h.name === name);
    expect(entry).toBeDefined();
    return entry!;
  }

  it("includes a rounds view in buildViews output", () => {
    const views = buildViews(SEASON_YEAR);
    expect(views.some((v) => v.viewKey === "rounds")).toBe(true);
  });

  it("picks the latest official present rating and ignores unofficial rows", () => {
    expect(holderByName("Alex Rivera").presentRating).toBe(1010);
    expect(holderByName("Sam Patel").presentRating).toBeNull();
    expect(holderByName("Morgan Kim").presentRating).toBe(815);
  });

  it("maps scoreToPar and roundRating through; null roundRating stays pending", () => {
    const alex = holderByName("Alex Rivera");
    const early1 = alex.rounds.find((r) => r.eventLabel === "Early League Night 1");
    expect(early1).toEqual(
      expect.objectContaining({ scoreToPar: -4, roundRating: 1015, subLeague: "EARLY" }),
    );

    const sam = holderByName("Sam Patel");
    const pending = sam.rounds.find((r) => r.eventLabel === "Mid League Night 1");
    expect(pending).toEqual(
      expect.objectContaining({ scoreToPar: 4, roundRating: null, subLeague: "MID" }),
    );
  });

  it("omits rounds from canceled events", () => {
    const alex = holderByName("Alex Rivera");
    expect(alex.rounds.some((r) => r.eventLabel === "Early League Night 3")).toBe(false);
    expect(
      listEvents(SEASON_YEAR).find((e) => e.id === earlyLeagueNight3EventId)!.canceled,
    ).toBe(true);
  });

  it("attributes sub-league on League Nights only", () => {
    const alex = holderByName("Alex Rivera");
    expect(alex.rounds.find((r) => r.eventLabel === "Mid League Night 1")?.subLeague).toBe("MID");
    expect(alex.rounds.find((r) => r.eventLabel === "Spring Open")?.subLeague).toBeNull();
    expect(alex.rounds.find((r) => r.eventLabel === "FOD Open Round 1")?.subLeague).toBeNull();
  });

  it("includes active holders with zero rounds", () => {
    const casey = holderByName("Casey Nguyen");
    expect(casey.rounds).toEqual([]);
    expect(roundsPayload().holders.length).toBe(
      listHolders(SEASON_YEAR).filter((h) => h.active).length,
    );
  });

  it("does not attach unmatched results to any holder", () => {
    const totalRoundRows = roundsPayload().holders.reduce((n, h) => n + h.rounds.length, 0);
    const matchedOnly = listHolders(SEASON_YEAR)
      .filter((h) => h.active)
      .reduce((n, h) => {
        const entry = holderByName(h.name);
        return n + entry.rounds.length;
      }, 0);
    expect(totalRoundRows).toBe(matchedOnly);
    expect(roundsPayload().holders.every((h) => !h.rounds.some((r) => r.scoreToPar === 7))).toBe(
      true,
    );
  });

  it("flags stale sub-leagues independently", () => {
    const midSource = listSources(SEASON_YEAR).find((s) => s.type === "MID")!;
    setSourceStale(midSource.id, true);
    try {
      const payload = roundsPayload();
      expect(payload.stale).toBe(true);
      expect(payload.staleLeagues).toEqual(["mid"]);
    } finally {
      setSourceStale(midSource.id, false);
    }
  });

  it("stamps freshness metadata at the build edge", () => {
    const payload = roundsPayload();
    expect(typeof payload.updatedAt).toBe("string");
    expect(typeof payload.pendingReview).toBe("number");
    expect(payload.stale).toBe(false);
    expect(payload.staleLeagues).toEqual([]);
  });
});

describe("read model: OLP view", () => {
  let listHoldersOlp: (
    seasonYear: number,
  ) => { id: number; name: string; pdgaMembership: boolean }[];
  let listSourcesOlp: (seasonYear: number) => { id: number; type: string }[];
  let updateSourceOlp: (id: number, patch: { complete?: boolean }) => void;
  let setSourceStaleOlp: (id: number, stale: boolean) => void;
  let insertEventOlp: (input: {
    seasonYear: number;
    eventSourceId: number;
    type: "LeagueNight";
    label: string;
    eventDate: string;
    roundOrdinal: number;
  }) => number;
  let insertResultOlp: (input: {
    seasonYear: number;
    eventId: number;
    displayName: string;
    holderId?: number | null;
    rawScoreToPar: number;
  }) => number;
  let upsertEntryCountOlp: (input: {
    seasonYear: number;
    eventId: number;
    paidEntries: number;
  }) => void;

  let alexId: number;
  let samId: number;
  let morganId: number;
  let midSourceId: number;

  beforeAll(async () => {
    const [tagHoldersRepo, eventSourcesRepo, eventsRepo, resultsRepo, entryCountsRepo] =
      await Promise.all([
        import("@server/db/repositories/tagHolders"),
        import("@server/db/repositories/eventSources"),
        import("@server/db/repositories/events"),
        import("@server/db/repositories/eventResults"),
        import("@server/db/repositories/entryCounts"),
      ]);

    listHoldersOlp = tagHoldersRepo.listHolders;
    listSourcesOlp = eventSourcesRepo.listSources;
    updateSourceOlp = eventSourcesRepo.updateSource;
    setSourceStaleOlp = eventSourcesRepo.setSourceStale;
    insertEventOlp = eventsRepo.insertEvent;
    insertResultOlp = resultsRepo.insertResult;
    upsertEntryCountOlp = entryCountsRepo.upsertEntryCount;

    const holders = listHoldersOlp(SEASON_YEAR);
    alexId = holders.find((h) => h.name === "Alex Rivera")!.id; // pdgaMembership: true
    samId = holders.find((h) => h.name === "Sam Patel")!.id; // pdgaMembership: false
    morganId = holders.find((h) => h.name === "Morgan Kim")!.id; // pdgaMembership: true
    midSourceId = listSourcesOlp(SEASON_YEAR).find((s) => s.type === "MID")!.id;

    // The seed fixture + the "rounds view" describe above already gives MID
    // one League Night (round 1) with Alex (-3) and Morgan (2), plus a
    // pending Sam row (rawScoreToPar 4) added by that block. Add 3 more MID
    // League Nights with Alex + Sam only (never Morgan), so: Alex reaches 4
    // rounds with PDGA membership (eligible); Sam reaches 4 rounds WITHOUT
    // PDGA membership (not-eligible: "no PDGA"); Morgan stays at 1 round
    // (not-eligible: "1 round").
    for (const roundOrdinal of [2, 3, 4]) {
      const eventId = insertEventOlp({
        seasonYear: SEASON_YEAR,
        eventSourceId: midSourceId,
        type: "LeagueNight",
        label: `Mid League Night ${roundOrdinal}`,
        eventDate: `2026-05-${20 + roundOrdinal}`,
        roundOrdinal,
      });
      insertResultOlp({
        seasonYear: SEASON_YEAR,
        eventId,
        holderId: alexId,
        displayName: "Alex Rivera",
        rawScoreToPar: -1,
      });
      insertResultOlp({
        seasonYear: SEASON_YEAR,
        eventId,
        holderId: samId,
        displayName: "Sam Patel",
        rawScoreToPar: 2,
      });
      upsertEntryCountOlp({ seasonYear: SEASON_YEAR, eventId, paidEntries: 5 });
    }
  });

  function olpView(type: "early" | "mid" | "late") {
    const view = buildViews(SEASON_YEAR).find((v) => v.viewKey === `olp/${type}`);
    expect(view).toBeDefined();
    return view!.payload as import("@/lib").PublicOlpPayload;
  }

  it("carries resolved names and engine score order", () => {
    const payload = olpView("mid");
    const byHolder = new Map(payload.rows.map((r) => [r.holderId, r]));

    expect(byHolder.get(alexId)?.name).toBe("Alex Rivera");
    expect(byHolder.get(samId)?.name).toBe("Sam Patel");
    expect(byHolder.get(morganId)?.name).toBe("Morgan Kim");

    // Engine order: sorted by score ascending (tie broken by tag number) —
    // already guaranteed by the engine, just checked here for the wiring.
    payload.rows.forEach((row, i) => {
      if (i > 0) {
        expect(payload.rows[i - 1]!.score).toBeLessThanOrEqual(row.score);
      }
    });
  });

  it("marks eligibility and reasons correctly (rounds vs. PDGA membership)", () => {
    const payload = olpView("mid");
    const byHolder = new Map(payload.rows.map((r) => [r.holderId, r]));

    const alex = byHolder.get(alexId)!;
    expect(alex.rounds).toBe(4);
    expect(alex.eligible).toBe(true);

    const sam = byHolder.get(samId)!;
    expect(sam.rounds).toBe(4);
    expect(sam.eligible).toBe(false); // 4 rounds but no PDGA membership

    const morgan = byHolder.get(morganId)!;
    expect(morgan.rounds).toBe(1);
    expect(morgan.eligible).toBe(false); // <4 rounds
  });

  it("computes the pot as $1 x seeded paid entries for that sub-league", () => {
    // 5 (seed's Mid League Night 1) + 5 + 5 + 5 (the 3 added above) = 20.
    expect(olpView("mid").pot).toBe(20);
  });

  it("marks projected true while the sub-league is incomplete, false once complete", () => {
    expect(olpView("mid").projected).toBe(true);

    updateSourceOlp(midSourceId, { complete: true });
    try {
      expect(olpView("mid").projected).toBe(false);
    } finally {
      updateSourceOlp(midSourceId, { complete: false });
    }
  });

  it("reflects only that sub-league's stale source", () => {
    setSourceStaleOlp(midSourceId, true);
    try {
      expect(olpView("mid").stale).toBe(true);
      expect(olpView("early").stale).toBe(false);
    } finally {
      setSourceStaleOlp(midSourceId, false);
    }
  });

  it("yields empty rows and a zero pot for a sub-league with no rounds", () => {
    const payload = olpView("late");
    expect(payload.rows).toEqual([]);
    expect(payload.pot).toBe(0);
  });

  it("excludes a canceled League Night from an eligible holder's rounds (wiring guard only)", () => {
    // Early League Night 3 is seeded canceled; Alex's EARLY OLP rounds
    // reflect only the 2 non-canceled nights — full cancellation behavior
    // is engine-tested (season.test.ts); this just guards the wiring.
    const early = olpView("early");
    const alex = early.rows.find((r) => r.holderId === alexId);
    expect(alex?.rounds).toBe(2);
  });
});
