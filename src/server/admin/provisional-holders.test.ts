// Sub-plan 04: confirm / merge / exclude mutations on auto-added
// provisional holders, plus the redefined `countPending` (provisional +
// ambiguous). Isolated temp DB (own DATA_DIR) — same pattern as
// review-queue.test.ts / admin.test.ts — seeded once, individual scenarios
// use distinct synthetic PDGA numbers/tag numbers so they don't interfere
// with each other within the shared DB.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SEASON_YEAR = 2026;
const DIRECTOR = "director@test.example";

let tempDir: string;

let insertHolder: (input: {
  seasonYear: number;
  name: string;
  tagNumber?: number | null;
  pool: "A" | "B";
  entryDate: string;
  pdgaNumber?: number | null;
  ratingAtEntry?: number | null;
  active?: boolean;
  pdgaMembership?: boolean;
  confirmed?: boolean;
}) => number;
let getHolder: (id: number) => { id: number; pool: "A" | "B"; tagNumber: number | null; confirmed: boolean; active: boolean } | undefined;
let listProvisionalHolders: (seasonYear: number) => Array<{ id: number }>;
let insertResult: (input: {
  seasonYear: number;
  eventId: number;
  pdgaNumber?: number | null;
  displayName: string;
  holderId?: number | null;
  rawScoreToPar: number;
}) => number;
let listResultsBySeason: (
  seasonYear: number,
) => Array<{ pdgaNumber: number | null; holderId: number | null }>;
let listEvents: (seasonYear: number) => Array<{ id: number; label: string }>;
let getMatch: (
  seasonYear: number,
  pdgaNumber: number,
) => { holderId: number | null; source: string; decidedBy: string } | undefined;
let getStickyMatches: (
  seasonYear: number,
) => Map<number, { holderId: number | null; source: "auto" | "admin" }>;
let countPending: (seasonYear: number) => number;
let listAudit: (
  seasonYear: number,
  limit?: number,
) => Array<{ action: string; entityType: string }>;

let confirmHolder: (
  input: {
    id: number;
    pool: "A" | "B";
    tagNumber?: number | null;
    ratingAtEntry?: number | null;
  },
  actorEmail: string | null,
) => Promise<{ publishedVersion: number; warning?: string }>;
let mergeProvisionalIntoHolder: (
  provisionalId: number,
  targetHolderId: number,
  actorEmail: string | null,
) => Promise<{ publishedVersion: number }>;
let markNonHolder: (
  pdgaNumber: number,
  actorEmail: string | null,
) => Promise<{ publishedVersion: number }>;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-provisional-"));
  process.env.DATA_DIR = tempDir;

  const [
    { applyMigrations },
    { seed },
    tagHoldersRepo,
    eventResultsRepo,
    eventsRepo,
    playerMatchesRepo,
    auditLogRepo,
    adminMutations,
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/db/repositories/tagHolders"),
    import("@server/db/repositories/eventResults"),
    import("@server/db/repositories/events"),
    import("@server/db/repositories/playerMatches"),
    import("@server/db/repositories/auditLog"),
    import("@server/admin/mutations"),
  ]);

  applyMigrations();
  seed();

  insertHolder = tagHoldersRepo.insertHolder;
  getHolder = tagHoldersRepo.getHolder;
  listProvisionalHolders = tagHoldersRepo.listProvisionalHolders;
  insertResult = eventResultsRepo.insertResult;
  listResultsBySeason = eventResultsRepo.listResultsBySeason;
  listEvents = eventsRepo.listEvents;
  getMatch = playerMatchesRepo.getMatch;
  getStickyMatches = playerMatchesRepo.getStickyMatches;
  countPending = playerMatchesRepo.countPending;
  listAudit = auditLogRepo.listAudit;

  confirmHolder = adminMutations.confirmHolder;
  mergeProvisionalIntoHolder = adminMutations.mergeProvisionalIntoHolder;
  markNonHolder = adminMutations.markNonHolder;
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

function addProvisional(overrides: {
  name: string;
  pdgaNumber: number;
  ratingAtEntry?: number | null;
}): number {
  return insertHolder({
    seasonYear: SEASON_YEAR,
    name: overrides.name,
    tagNumber: null,
    pool: "A",
    entryDate: "2026-05-01T00:00:00.000Z",
    pdgaNumber: overrides.pdgaNumber,
    ratingAtEntry: overrides.ratingAtEntry ?? null,
    pdgaMembership: true,
    confirmed: false,
  });
}

describe("confirmHolder", () => {
  it("sets pool/tag, confirms, and drops the holder from the provisional list", async () => {
    const id = addProvisional({ name: "Confirm Me", pdgaNumber: 900001 });
    expect(listProvisionalHolders(SEASON_YEAR).some((h) => h.id === id)).toBe(true);

    const result = await confirmHolder({ id, pool: "B", tagNumber: 900 }, DIRECTOR);

    const holder = getHolder(id)!;
    expect(holder.pool).toBe("B");
    expect(holder.tagNumber).toBe(900);
    expect(holder.confirmed).toBe(true);
    expect(listProvisionalHolders(SEASON_YEAR).some((h) => h.id === id)).toBe(false);
    expect(result.publishedVersion).toBeGreaterThan(0);
    expect(
      listAudit(SEASON_YEAR, 10).some((a) => a.action === "confirm" && a.entityType === "tag_holder"),
    ).toBe(true);
  });

  it("rejects a duplicate tag number", async () => {
    const id = addProvisional({ name: "Duplicate Tag Attempt", pdgaNumber: 900002 });
    // Tag 900 was claimed by the previous test's confirm.
    await expect(confirmHolder({ id, pool: "A", tagNumber: 900 }, DIRECTOR)).rejects.toThrow(
      /Tag number 900/,
    );
  });

  it("warns when confirming into Pool B at a rating >= 900, and allows a tagless confirm", async () => {
    const id = addProvisional({ name: "High Rated B", pdgaNumber: 900003, ratingAtEntry: 925 });

    const result = await confirmHolder({ id, pool: "B" }, DIRECTOR);

    expect(result.warning).toMatch(/Pool B.*925/);
    const holder = getHolder(id)!;
    expect(holder.confirmed).toBe(true);
    expect(holder.tagNumber).toBeNull();
  });

  it("rejects re-confirming an already-confirmed holder", async () => {
    const id = addProvisional({ name: "Double Confirm", pdgaNumber: 900004 });
    await confirmHolder({ id, pool: "A" }, DIRECTOR);

    await expect(confirmHolder({ id, pool: "A" }, DIRECTOR)).rejects.toThrow(/already confirmed/);
  });

  it("rejects an unknown holder id", async () => {
    await expect(confirmHolder({ id: 999999999, pool: "A" }, DIRECTOR)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("mergeProvisionalIntoHolder", () => {
  it("re-points results to the target, retires the provisional, and stickies the PDGA #", async () => {
    const provisionalId = addProvisional({ name: "Merge Source", pdgaNumber: 910001 });
    const targetId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Merge Target",
      tagNumber: 910,
      pool: "A",
      entryDate: "2026-05-01T00:00:00.000Z",
      pdgaNumber: null,
      pdgaMembership: true,
    });

    const [eventA, eventB] = listEvents(SEASON_YEAR);
    expect(eventA).toBeDefined();
    expect(eventB).toBeDefined();
    insertResult({
      seasonYear: SEASON_YEAR,
      eventId: eventA!.id,
      pdgaNumber: 910001,
      displayName: "Merge Source",
      holderId: provisionalId,
      rawScoreToPar: -2,
    });
    insertResult({
      seasonYear: SEASON_YEAR,
      eventId: eventB!.id,
      pdgaNumber: 910001,
      displayName: "Merge Source",
      holderId: provisionalId,
      rawScoreToPar: 1,
    });

    await mergeProvisionalIntoHolder(provisionalId, targetId, DIRECTOR);

    const rows = listResultsBySeason(SEASON_YEAR).filter((r) => r.pdgaNumber === 910001);
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.holderId === targetId)).toBe(true);

    expect(getHolder(provisionalId)!.active).toBe(false);

    const sticky = getMatch(SEASON_YEAR, 910001)!;
    expect(sticky.holderId).toBe(targetId);
    expect(sticky.source).toBe("admin");
    expect(sticky.decidedBy).toBe(DIRECTOR);

    expect(
      listAudit(SEASON_YEAR, 10).some((a) => a.action === "merge" && a.entityType === "tag_holder"),
    ).toBe(true);

    // "Re-run keeps it merged" — the sticky map the pipeline consults on
    // every refresh (`getStickyMatches`, see pipeline.ts) reflects the
    // admin decision, so any future match of this PDGA # resolves straight
    // to the target holder rather than re-triggering auto-add/auto-link.
    const stickyMap = getStickyMatches(SEASON_YEAR);
    expect(stickyMap.get(910001)).toEqual({ holderId: targetId, source: "admin" });
  });

  it("rejects merging a holder into itself", async () => {
    const id = addProvisional({ name: "Self Merge", pdgaNumber: 910002 });
    await expect(mergeProvisionalIntoHolder(id, id, DIRECTOR)).rejects.toThrow(/itself/);
  });

  it("rejects an unknown provisional or target id", async () => {
    const targetId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Some Target",
      tagNumber: 911,
      pool: "A",
      entryDate: "2026-05-01T00:00:00.000Z",
      pdgaMembership: true,
    });
    await expect(mergeProvisionalIntoHolder(999999999, targetId, DIRECTOR)).rejects.toMatchObject({
      code: "not_found",
    });

    const provisionalId = addProvisional({ name: "Orphan Merge", pdgaNumber: 910003 });
    await expect(mergeProvisionalIntoHolder(provisionalId, 999999999, DIRECTOR)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("markNonHolder — provisional retirement", () => {
  it("reverts results to holderId=null, deactivates the provisional, and stickies non-holder", async () => {
    const provisionalId = addProvisional({ name: "Exclude Me", pdgaNumber: 920001 });
    const [event] = listEvents(SEASON_YEAR);
    expect(event).toBeDefined();
    insertResult({
      seasonYear: SEASON_YEAR,
      eventId: event!.id,
      pdgaNumber: 920001,
      displayName: "Exclude Me",
      holderId: provisionalId,
      rawScoreToPar: 4,
    });

    await markNonHolder(920001, DIRECTOR);

    const rows = listResultsBySeason(SEASON_YEAR).filter((r) => r.pdgaNumber === 920001);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.holderId === null)).toBe(true);

    expect(getHolder(provisionalId)!.active).toBe(false);

    const sticky = getMatch(SEASON_YEAR, 920001)!;
    expect(sticky.holderId).toBeNull();
    expect(sticky.source).toBe("admin");

    // "Re-run does not re-add" — the sticky map resolves this PDGA # to a
    // confirmed non-holder, so `match()` will `continue` past it (see
    // match.ts) rather than classifying it as a fresh auto-add candidate.
    const stickyMap = getStickyMatches(SEASON_YEAR);
    expect(stickyMap.get(920001)).toEqual({ holderId: null, source: "admin" });
  });

  it("never deactivates an already-confirmed holder sharing the excluded PDGA #", async () => {
    // A confirmed holder's PDGA # being marked non-holder (the existing
    // section-B "ambiguous" flow) must not touch the confirmed record —
    // only an active, unconfirmed (auto-added) holder is fair game.
    const confirmedId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Definitely A Holder",
      tagNumber: 921,
      pool: "A",
      entryDate: "2026-05-01T00:00:00.000Z",
      pdgaNumber: 920002,
      pdgaMembership: true,
    });

    await markNonHolder(920002, DIRECTOR);

    const holder = getHolder(confirmedId)!;
    expect(holder.active).toBe(true);
    expect(holder.confirmed).toBe(true);
  });
});

describe("countPending — provisional + ambiguous", () => {
  it("counts a new provisional and a new ambiguous entrant, and drops by one on confirm", async () => {
    const before = countPending(SEASON_YEAR);

    const provisionalId = addProvisional({ name: "Pending Count Provisional", pdgaNumber: 930001 });
    const [event] = listEvents(SEASON_YEAR);
    insertResult({
      seasonYear: SEASON_YEAR,
      eventId: event!.id,
      pdgaNumber: 930002,
      displayName: "Pending Count Ambiguous",
      holderId: null,
      rawScoreToPar: 0,
    });

    expect(countPending(SEASON_YEAR)).toBe(before + 2);

    await confirmHolder({ id: provisionalId, pool: "A" }, DIRECTOR);

    expect(countPending(SEASON_YEAR)).toBe(before + 1);
  });
});
