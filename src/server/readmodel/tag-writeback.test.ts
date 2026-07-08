// Tag reassignment read-model write-back (plans/tag-reassignment/
// 04-readmodel-and-writeback.md "Tests"): the engine's `currentTagByHolder`
// (Spec 02 §2.10) must land in `tag_holders.current_tag_number` atomically
// with the publish, rounds Tag data (tag-in -> tag-out) must reflect the
// timeline, and canonical slugs must stay pinned to the INITIAL tag even
// when a holder's current tag moves (Spec 08 §8.2).
//
// Isolated temp DB, own seed + fixture holders/events (does not reuse
// build.test.ts's shared fixture) so the controlled two-holder tag swap
// this test drives can't perturb any other test's assertions.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PublicPlayersIndexPayload, PublicRoundsPayload } from "@/lib";
import type { BuildViewsResult, ViewRow } from "@server/readmodel/build";

const SEASON_YEAR = 2026;

let tempDir: string;
let buildViews: (seasonYear: number) => BuildViewsResult;
let publish: (
  seasonYear: number,
  views: ViewRow[],
  currentTags: Record<number, number | null>,
) => number;
let buildAndPublish: (seasonYear: number) => number;
let getPublished: (
  seasonYear: number,
  viewKey: string,
) => { payload: unknown } | undefined;
let insertHolder: (input: {
  seasonYear: number;
  name: string;
  tagNumber?: number | null;
  pool: "A" | "B";
  entryDate: string;
  confirmed?: boolean;
}) => number;
let listHolders: (
  seasonYear: number,
) => { id: number; tagNumber: number | null; currentTagNumber: number | null }[];
let listSources: (seasonYear: number) => { id: number; type: string }[];
let insertEvent: (input: {
  seasonYear: number;
  eventSourceId: number;
  type: "LeagueNight" | "Tournament";
  label: string;
  eventDate: string;
  roundOrdinal?: number | null;
}) => number;
let insertResult: (input: {
  seasonYear: number;
  eventId: number;
  displayName: string;
  holderId?: number | null;
  rawScoreToPar: number;
  tagPresent?: boolean;
}) => number;
let insertSource: (input: {
  seasonYear: number;
  pdgaEventId: string;
  type: "TOURNAMENT";
  label: string;
}) => number;

let rileyLowId: number; // initial tag 301, ends up with 302
let rileyHighId: number; // initial tag 302, ends up with 301
let tagelessId: number;
let swapEventId: number;
let tourneyEventId: number;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-vitest-tag-writeback-"));
  process.env.DATA_DIR = tempDir;

  const [
    { applyMigrations },
    { seed },
    readmodel,
    readModelRepo,
    tagHoldersRepo,
    eventSourcesRepo,
    eventsRepo,
    resultsRepo,
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/readmodel"),
    import("@server/db/repositories/readModel"),
    import("@server/db/repositories/tagHolders"),
    import("@server/db/repositories/eventSources"),
    import("@server/db/repositories/events"),
    import("@server/db/repositories/eventResults"),
  ]);

  buildViews = readmodel.buildViews;
  publish = readmodel.publish;
  buildAndPublish = readmodel.buildAndPublish;
  getPublished = readModelRepo.getPublished;
  insertHolder = tagHoldersRepo.insertHolder;
  listHolders = tagHoldersRepo.listHolders;
  listSources = eventSourcesRepo.listSources;
  insertSource = eventSourcesRepo.insertSource;
  insertEvent = eventsRepo.insertEvent;
  insertResult = resultsRepo.insertResult;

  applyMigrations();
  seed();

  // Two same-named holders (forces a slug-suffix collision) with distinct,
  // previously-unused initial tags.
  rileyLowId = insertHolder({
    seasonYear: SEASON_YEAR,
    name: "Riley Fox",
    tagNumber: 301,
    pool: "A",
    entryDate: "2026-01-01T00:00:00.000Z",
  });
  rileyHighId = insertHolder({
    seasonYear: SEASON_YEAR,
    name: "Riley Fox",
    tagNumber: 302,
    pool: "A",
    entryDate: "2026-01-01T00:00:00.000Z",
  });
  // A provisional (auto-added) holder with no initial tag — "who is in the
  // pile" edge case: present in results but never a computed participant.
  tagelessId = insertHolder({
    seasonYear: SEASON_YEAR,
    name: "Tagless Newcomer",
    tagNumber: null,
    pool: "A",
    entryDate: "2026-07-01T00:00:00.000Z",
    confirmed: false,
  });

  const lateSourceId = listSources(SEASON_YEAR).find((s) => s.type === "LATE")!.id;

  // A League Night whose ONLY participants are the two Riley Foxes — an
  // isolated two-holder combined-field pile so the reassignment touches
  // exactly these two tags and nothing else in the shared seed fixture
  // (Spec 02 §2.10 "the physical mechanic": best score takes the lowest
  // tag in the pile). rileyHigh (tag 302) scores better than rileyLow (tag
  // 301), so they swap: rileyHigh -> 301, rileyLow -> 302.
  swapEventId = insertEvent({
    seasonYear: SEASON_YEAR,
    eventSourceId: lateSourceId,
    type: "LeagueNight",
    label: "Late Swap Night",
    eventDate: "2026-07-15",
    roundOrdinal: 99,
  });
  insertResult({
    seasonYear: SEASON_YEAR,
    eventId: swapEventId,
    holderId: rileyLowId,
    displayName: "Riley Fox",
    rawScoreToPar: 5,
  });
  insertResult({
    seasonYear: SEASON_YEAR,
    eventId: swapEventId,
    holderId: rileyHighId,
    displayName: "Riley Fox",
    rawScoreToPar: -5,
  });
  // Present but tagless — has a result, but no initial tag and no
  // override, so the engine never seeds them into the pile (Spec 02 §2.10
  // "who is in the pile").
  insertResult({
    seasonYear: SEASON_YEAR,
    eventId: swapEventId,
    holderId: tagelessId,
    displayName: "Tagless Newcomer",
    rawScoreToPar: 0,
  });

  // A later Tournament round for rileyHigh, to prove a non-League-Night
  // row carries the holder's tag AS OF that date (post-swap: 301), not a
  // fresh reassignment (Tournament rounds never reassign).
  const tourneySourceId = insertSource({
    seasonYear: SEASON_YEAR,
    pdgaEventId: "TEST-SWAP-TOURNEY-2026",
    type: "TOURNAMENT",
    label: "Post-swap Tournament Source",
  });
  tourneyEventId = insertEvent({
    seasonYear: SEASON_YEAR,
    eventSourceId: tourneySourceId,
    type: "Tournament",
    label: "Post-swap Open",
    eventDate: "2026-07-20",
  });
  insertResult({
    seasonYear: SEASON_YEAR,
    eventId: tourneyEventId,
    holderId: rileyHighId,
    displayName: "Riley Fox",
    rawScoreToPar: -2,
  });
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

describe("read model: tag timeline write-back (tag-reassignment sub-plan 04)", () => {
  it("writes each holder's engine-computed current tag back to tag_holders atomically with publish", () => {
    buildAndPublish(SEASON_YEAR);

    const holders = listHolders(SEASON_YEAR);
    const rileyLow = holders.find((h) => h.id === rileyLowId)!;
    const rileyHigh = holders.find((h) => h.id === rileyHighId)!;

    // Initial tags never change.
    expect(rileyLow.tagNumber).toBe(301);
    expect(rileyHigh.tagNumber).toBe(302);

    // Current tags reflect the engine's combined-field swap: the better
    // score (rileyHigh) took the lower tag in the pile.
    expect(rileyHigh.currentTagNumber).toBe(301);
    expect(rileyLow.currentTagNumber).toBe(302);

    // The tagless holder never enters the sequence (no initial tag, no
    // override) — current tag stays null.
    expect(holders.find((h) => h.id === tagelessId)!.currentTagNumber).toBeNull();
  });

  it("keeps canonical slugs pinned to the INITIAL tag even though current tags diverged (Spec 08 §8.2)", () => {
    buildAndPublish(SEASON_YEAR);

    const index = getPublished(SEASON_YEAR, "players")!.payload as PublicPlayersIndexPayload;
    const rileyLowRow = index.holders.find((h) => h.holderId === rileyLowId)!;
    const rileyHighRow = index.holders.find((h) => h.holderId === rileyHighId)!;

    // Suffixed by the INITIAL tag (301/302), not the post-swap current tag.
    expect(rileyLowRow.slug).toBe("riley-fox-301");
    expect(rileyHighRow.slug).toBe("riley-fox-302");

    // But the displayed tagNumber on the holder-facing row IS the current
    // tag (sub-plan 04 "current tag on holder-facing rows").
    expect(rileyLowRow.tagNumber).toBe(302);
    expect(rileyHighRow.tagNumber).toBe(301);

    // Slugs stay identical across a second recompute — proof of stability,
    // not a coincidence of the first build.
    buildAndPublish(SEASON_YEAR);
    const index2 = getPublished(SEASON_YEAR, "players")!.payload as PublicPlayersIndexPayload;
    expect(index2.holders.find((h) => h.holderId === rileyLowId)!.slug).toBe("riley-fox-301");
    expect(index2.holders.find((h) => h.holderId === rileyHighId)!.slug).toBe("riley-fox-302");
  });

  it("publishes rounds tag-in/tag-out for the swap night, and null for the tagless holder", () => {
    buildAndPublish(SEASON_YEAR);

    const rounds = getPublished(SEASON_YEAR, "rounds")!.payload as PublicRoundsPayload;
    const rileyLowEntry = rounds.holders.find((h) => h.holderId === rileyLowId)!;
    const rileyHighEntry = rounds.holders.find((h) => h.holderId === rileyHighId)!;
    const tagelessEntry = rounds.holders.find((h) => h.holderId === tagelessId)!;

    const lowRound = rileyLowEntry.rounds.find((r) => r.eventId === swapEventId)!;
    expect(lowRound.tagIn).toBe(301);
    expect(lowRound.tagOut).toBe(302);

    const highRound = rileyHighEntry.rounds.find((r) => r.eventId === swapEventId)!;
    expect(highRound.tagIn).toBe(302);
    expect(highRound.tagOut).toBe(301);

    const tagelessRound = tagelessEntry.rounds.find((r) => r.eventId === swapEventId)!;
    expect(tagelessRound.tagIn).toBeNull();
    expect(tagelessRound.tagOut).toBeNull();
  });

  it("a Tournament round (no reassignment) carries the holder's tag as of that date", () => {
    buildAndPublish(SEASON_YEAR);

    const rounds = getPublished(SEASON_YEAR, "rounds")!.payload as PublicRoundsPayload;
    const rileyHighEntry = rounds.holders.find((h) => h.holderId === rileyHighId)!;
    const tourneyRound = rileyHighEntry.rounds.find((r) => r.eventId === tourneyEventId)!;

    // rileyHigh's current tag as of 2026-07-20 (after the 2026-07-15 swap)
    // is 301 — tagIn and tagOut are equal since Tournament rounds don't
    // reassign.
    expect(tourneyRound.tagIn).toBe(301);
    expect(tourneyRound.tagOut).toBe(301);
  });

  it("leaves current tags unchanged when a publish throws mid-transaction (atomic with the pointer flip)", () => {
    const before = listHolders(SEASON_YEAR);
    const rileyLowBefore = before.find((h) => h.id === rileyLowId)!.currentTagNumber;
    const rileyHighBefore = before.find((h) => h.id === rileyHighId)!.currentTagNumber;

    const { views, currentTags } = buildViews(SEASON_YEAR);
    // Corrupt one holder's would-be write-back value so, if write-back ran
    // outside the transaction (or before the throwing insert), we'd catch
    // it — then force the same mid-transaction failure as build.test.ts
    // (a duplicated view row collides with the read_model unique index).
    expect(() => publish(SEASON_YEAR, [...views, views[0]!], currentTags)).toThrow();

    const after = listHolders(SEASON_YEAR);
    expect(after.find((h) => h.id === rileyLowId)!.currentTagNumber).toBe(rileyLowBefore);
    expect(after.find((h) => h.id === rileyHighId)!.currentTagNumber).toBe(rileyHighBefore);
  });
});
