// Rounds roster page integration (plans/rounds-and-ratings/04-roster-page.md).
//
// Asserts the pure composition the `/[season]/rounds` server page performs:
// seed → buildAndPublish → getPublished("rounds") → summarizeRoster at filters.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  filterHolderRounds,
  parseRoundsFilter,
  serializeRoundsFilter,
  slugifyName,
  summarizeRoster,
} from "@/lib";
import type { PublicRoundsPayload } from "@/lib";

const SEASON_YEAR = 2026;

let tempDir: string;
let buildAndPublish: (seasonYear: number) => number;
let getPublished: (
  seasonYear: number,
  viewKey: string,
) => { payload: unknown } | undefined;
let listHolders: (seasonYear: number) => { id: number; name: string; tagNumber: number; active: boolean }[];
let listEvents: (seasonYear: number) => { id: number; label: string; canceled: boolean }[];
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
  type: "Tournament" | "FODOpen" | "LeagueNight";
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
let listSources: (seasonYear: number) => { id: number; type: string }[];
let setSourceStale: (id: number, stale: boolean) => void;

let alexId: number;
let samId: number;
let morganId: number;
let jordanId: number;
let midLeagueNightEventId: number;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-vitest-rounds-integration-"));
  process.env.DATA_DIR = tempDir;

  const [
    { applyMigrations },
    { seed },
    readmodel,
    readModelRepo,
    tagHoldersRepo,
    eventsRepo,
    ratingsRepo,
    sourcesRepo,
    resultsRepo,
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/readmodel"),
    import("@server/db/repositories/readModel"),
    import("@server/db/repositories/tagHolders"),
    import("@server/db/repositories/events"),
    import("@server/db/repositories/ratingsHistory"),
    import("@server/db/repositories/eventSources"),
    import("@server/db/repositories/eventResults"),
  ]);

  buildAndPublish = readmodel.buildAndPublish;
  getPublished = readModelRepo.getPublished;
  listHolders = tagHoldersRepo.listHolders;
  listEvents = eventsRepo.listEvents;
  insertRating = ratingsRepo.insertRating;
  insertSource = sourcesRepo.insertSource;
  insertEvent = eventsRepo.insertEvent;
  insertResult = resultsRepo.insertResult;
  listSources = sourcesRepo.listSources;
  setSourceStale = sourcesRepo.setSourceStale;

  applyMigrations();
  seed();

  const holders = listHolders(SEASON_YEAR);
  alexId = holders.find((h) => h.name === "Alex Rivera")!.id;
  samId = holders.find((h) => h.name === "Sam Patel")!.id;
  morganId = holders.find((h) => h.name === "Morgan Kim")!.id;
  jordanId = holders.find((h) => h.name === "Jordan Lee")!.id;

  const events = listEvents(SEASON_YEAR);
  midLeagueNightEventId = events.find((e) => e.label === "Mid League Night 1")!.id;

  insertRating({
    seasonYear: SEASON_YEAR,
    holderId: alexId,
    effectiveDate: "2026-05-15",
    rating: 1050,
    official: false,
  });

  insertRating({
    seasonYear: SEASON_YEAR,
    holderId: samId,
    effectiveDate: "2026-05-01",
    rating: 940,
    official: false,
  });

  insertRating({
    seasonYear: SEASON_YEAR,
    holderId: morganId,
    effectiveDate: "2026-03-01",
    rating: 810,
    official: true,
  });

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

  const lateSourceId = listSources(SEASON_YEAR).find((s) => s.type === "LATE")!.id;
  const lateEventId = insertEvent({
    seasonYear: SEASON_YEAR,
    eventSourceId: lateSourceId,
    type: "LeagueNight",
    label: "Late League Night 1",
    eventDate: "2026-07-10",
  });
  insertResult({
    seasonYear: SEASON_YEAR,
    eventId: lateEventId,
    holderId: jordanId,
    displayName: "Jordan Lee",
    pdgaNumber: 234567,
    rawScoreToPar: -1,
    roundRating: 990,
  });
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

function publishedPayload(): PublicRoundsPayload {
  buildAndPublish(SEASON_YEAR);
  const view = getPublished(SEASON_YEAR, "rounds");
  expect(view).toBeDefined();
  return view!.payload as PublicRoundsPayload;
}

function rosterRowByName(
  payload: PublicRoundsPayload,
  filter: ReturnType<typeof parseRoundsFilter>,
  name: string,
) {
  const roster = summarizeRoster(payload.holders, filter);
  const row = roster.find((r) => r.name === name);
  expect(row).toBeDefined();
  return row!;
}

function rosterPageStale(
  payload: PublicRoundsPayload,
  filter: ReturnType<typeof parseRoundsFilter>,
): boolean {
  return filter.league ? payload.staleLeagues.includes(filter.league) : payload.stale;
}

describe("Rounds roster page integration (plans/rounds-and-ratings/04)", () => {
  it("summarizeRoster at default filter orders rated desc, unrated last, tag# tie-break", () => {
    const payload = publishedPayload();
    const filter = parseRoundsFilter({});
    const roster = summarizeRoster(payload.holders, filter);

    expect(roster.map((r) => r.name)).toEqual([
      "Alex Rivera",
      "Morgan Kim",
      "Jordan Lee",
      "Sam Patel",
      "Casey Nguyen",
      "Taylor Brooks",
    ]);

    const alex = rosterRowByName(payload, filter, "Alex Rivera");
    expect(alex.presentRating).toBe(1010);
    expect(alex.roundCount).toBe(3);
    expect(alex.trend).toEqual([1015, 995, 1005]);
  });

  it("summarizeRoster at league=mid counts only MID league nights", () => {
    const payload = publishedPayload();
    const filter = parseRoundsFilter({ league: "mid" });

    const alex = rosterRowByName(payload, filter, "Alex Rivera");
    expect(alex.roundCount).toBe(1);
    expect(alex.trend).toEqual([]);

    const morgan = rosterRowByName(payload, filter, "Morgan Kim");
    expect(morgan.roundCount).toBe(1);

    const sam = rosterRowByName(payload, filter, "Sam Patel");
    expect(sam.roundCount).toBe(1);
  });

  it("summarizeRoster at types=ln,tournament includes tournament rounds in counts", () => {
    const payload = publishedPayload();
    const filter = parseRoundsFilter({ types: "ln,tournament" });
    const alex = rosterRowByName(payload, filter, "Alex Rivera");

    expect(alex.roundCount).toBe(4);
    expect(alex.trend).toEqual([1015, 995, 1005, 1030]);
  });

  it("drill-in href carries the active filter via serializeRoundsFilter", () => {
    const filter = parseRoundsFilter({ league: "mid", types: "ln" });
    const serialized = serializeRoundsFilter(filter);
    expect(serialized).toEqual({ league: "mid" });

    const search = new URLSearchParams();
    if (serialized.league !== undefined) {
      search.set("league", serialized.league);
    }
    if (serialized.types !== undefined) {
      search.set("types", serialized.types);
    }

    const slug = slugifyName("Alex Rivera");
    expect(`/${SEASON_YEAR}/players/${slug}/rounds?${search.toString()}`).toBe(
      `/${SEASON_YEAR}/players/alex-rivera/rounds?league=mid`,
    );
  });

  it("includes holders with zero rounds when they have no event results", () => {
    const payload = publishedPayload();
    const filter = parseRoundsFilter({});
    const roster = summarizeRoster(payload.holders, filter);

    expect(roster.length).toBe(listHolders(SEASON_YEAR).filter((h) => h.active).length);

    const casey = rosterRowByName(payload, filter, "Casey Nguyen");
    expect(casey.roundCount).toBe(0);
    expect(casey.trend).toEqual([]);
  });
});

describe("Per-player rounds page integration (plans/rounds-and-ratings/05)", () => {
  it("resolves holder by slug and filters MID league nights newest-first", () => {
    const payload = publishedPayload();
    const alexSlug = slugifyName("Alex Rivera");
    const entry = payload.holders.find((h) => h.slug === alexSlug);

    expect(entry).toBeDefined();
    expect(entry!.name).toBe("Alex Rivera");
    expect(entry!.presentRating).toBe(1010);

    const filter = parseRoundsFilter({ league: "mid", types: "ln" });
    const filtered = filterHolderRounds(entry!.rounds, filter);

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((r) => r.type === "LeagueNight" && r.subLeague === "MID")).toBe(true);
    expect(filtered.some((r) => r.type === "Tournament")).toBe(false);

    for (let i = 1; i < filtered.length; i++) {
      expect(filtered[i - 1]!.date.localeCompare(filtered[i]!.date)).toBeGreaterThanOrEqual(0);
    }
  });

  it("includes null roundRating for pending rounds under league=mid", () => {
    const payload = publishedPayload();
    const samSlug = slugifyName("Sam Patel");
    const entry = payload.holders.find((h) => h.slug === samSlug);

    expect(entry).toBeDefined();

    const filter = parseRoundsFilter({ league: "mid" });
    const filtered = filterHolderRounds(entry!.rounds, filter);
    const pending = filtered.find((r) => r.eventLabel === "Mid League Night 1");

    expect(pending).toBeDefined();
    expect(pending!.roundRating).toBeNull();
  });

  it("returns undefined for a bogus slug (page notFound trigger)", () => {
    const payload = publishedPayload();
    expect(payload.holders.find((h) => h.slug === "bogus-slug")).toBeUndefined();
  });

  it("back link preserves the active filter via serializeRoundsFilter", () => {
    const filter = parseRoundsFilter({ league: "mid" });
    const serialized = serializeRoundsFilter(filter);
    expect(serialized).toEqual({ league: "mid" });

    const search = new URLSearchParams();
    if (serialized.league !== undefined) {
      search.set("league", serialized.league);
    }
    if (serialized.types !== undefined) {
      search.set("types", serialized.types);
    }

    expect(`/${SEASON_YEAR}/rounds?${search.toString()}`).toBe(`/${SEASON_YEAR}/rounds?league=mid`);
  });
});

describe("Rounds integration closeout (plans/rounds-and-ratings/06)", () => {
  it("summarizeRoster at league=late counts only LATE league nights", () => {
    const payload = publishedPayload();
    const filter = parseRoundsFilter({ league: "late" });
    const jordan = rosterRowByName(payload, filter, "Jordan Lee");

    expect(jordan.roundCount).toBe(1);
    expect(jordan.trend).toEqual([]);

    const alex = rosterRowByName(payload, filter, "Alex Rivera");
    expect(alex.roundCount).toBe(0);
  });

  it("summarizeRoster at types=ln,fodopen excludes tournament rounds", () => {
    const payload = publishedPayload();
    const filter = parseRoundsFilter({ types: "ln,fodopen" });
    const alex = rosterRowByName(payload, filter, "Alex Rivera");

    expect(alex.roundCount).toBe(4);
    expect(alex.trend).toEqual([1015, 995, 1005, 1018]);
  });

  it("roster page stale flag is league-scoped from staleLeagues", () => {
    const midSource = listSources(SEASON_YEAR).find((s) => s.type === "MID")!;
    setSourceStale(midSource.id, true);
    try {
      const payload = publishedPayload();
      expect(payload.stale).toBe(true);
      expect(payload.staleLeagues).toEqual(["mid"]);

      const midFilter = parseRoundsFilter({ league: "mid" });
      expect(rosterPageStale(payload, midFilter)).toBe(true);

      const earlyFilter = parseRoundsFilter({ league: "early" });
      expect(rosterPageStale(payload, earlyFilter)).toBe(false);

      const allFilter = parseRoundsFilter({});
      expect(rosterPageStale(payload, allFilter)).toBe(true);
    } finally {
      setSourceStale(midSource.id, false);
    }
  });

  it("published payload resolves present rating from latest official row only", () => {
    const payload = publishedPayload();
    const byName = new Map(payload.holders.map((h) => [h.name, h.presentRating]));

    expect(byName.get("Alex Rivera")).toBe(1010);
    expect(byName.get("Sam Patel")).toBeNull();
    expect(byName.get("Morgan Kim")).toBe(815);
  });

  it("filterHolderRounds under league=late is newest-first and league-night only", () => {
    const payload = publishedPayload();
    const jordan = payload.holders.find((h) => h.name === "Jordan Lee")!;
    const filter = parseRoundsFilter({ league: "late" });
    const filtered = filterHolderRounds(jordan.rounds, filter);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({
      eventLabel: "Late League Night 1",
      type: "LeagueNight",
      subLeague: "LATE",
      roundRating: 990,
    });
  });
});
