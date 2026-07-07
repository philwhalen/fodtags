// Sub-plan 05: thin action -> mutation happy-path tests for the section-A
// confirm / merge / exclude server actions (Spec 10 §10.4). The mutation
// logic itself (validation, sticky links, audit) is already exercised in
// `src/server/admin/provisional-holders.test.ts` (sub-plan 04) — this file
// only proves the actions correctly parse FormData and delegate to those
// mutations with `actorEmail` from the (mocked) director session.
//
// Same dynamic-import-after-DATA_DIR pattern as tagHolders.test.ts /
// provisional-holders.test.ts: `@server/config` freezes `process.env` at
// first import, so `DATA_DIR` must be set before any server module loads.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const SEASON_YEAR = 2026;
const DIRECTOR = "director@test.example";

// `requireDirectorEmail` normally calls NextAuth's `auth()`, which needs a
// live request context unavailable under Vitest — stub it with a fixed
// director email so the actions under test can be exercised directly.
vi.mock("@server/admin/require-director", () => ({
  requireDirectorEmail: async () => DIRECTOR,
}));

let tempDir: string;

let insertHolder: typeof import("@server/db/repositories/tagHolders").insertHolder;
let getHolder: typeof import("@server/db/repositories/tagHolders").getHolder;
let listProvisionalHolders: typeof import("@server/db/repositories/tagHolders").listProvisionalHolders;
let insertResult: typeof import("@server/db/repositories/eventResults").insertResult;
let listResultsBySeason: typeof import("@server/db/repositories/eventResults").listResultsBySeason;
let listEvents: typeof import("@server/db/repositories/events").listEvents;
let getMatch: typeof import("@server/db/repositories/playerMatches").getMatch;

let confirmHolderAction: typeof import("../actions").confirmHolderAction;
let mergeProvisionalIntoHolderAction: typeof import("../actions").mergeProvisionalIntoHolderAction;
let markNonHolderAction: typeof import("../actions").markNonHolderAction;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-admin-actions-"));
  process.env.DATA_DIR = tempDir;

  const [
    { applyMigrations },
    { seed },
    tagHoldersRepo,
    eventResultsRepo,
    eventsRepo,
    playerMatchesRepo,
    actionsMod,
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/db/repositories/tagHolders"),
    import("@server/db/repositories/eventResults"),
    import("@server/db/repositories/events"),
    import("@server/db/repositories/playerMatches"),
    import("../actions"),
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

  confirmHolderAction = actionsMod.confirmHolderAction;
  mergeProvisionalIntoHolderAction = actionsMod.mergeProvisionalIntoHolderAction;
  markNonHolderAction = actionsMod.markNonHolderAction;
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

function addProvisional(overrides: { name: string; pdgaNumber: number }): number {
  return insertHolder({
    seasonYear: SEASON_YEAR,
    name: overrides.name,
    tagNumber: null,
    pool: "A",
    entryDate: "2026-05-01T00:00:00.000Z",
    pdgaNumber: overrides.pdgaNumber,
    ratingAtEntry: null,
    pdgaMembership: true,
    confirmed: false,
  });
}

describe("confirmHolderAction", () => {
  it("parses the form and confirms the holder with the actor from the session", async () => {
    const id = addProvisional({ name: "Action Confirm Me", pdgaNumber: 950001 });

    const formData = new FormData();
    formData.set("id", String(id));
    formData.set("pool", "B");
    formData.set("tagNumber", "950");
    formData.set("name", "Action Confirm Me");
    formData.set("entryDate", "2026-05-01T00:00:00.000Z");
    formData.set("ratingAtEntry", "");
    formData.set("pdgaMembership", "on");

    const result = await confirmHolderAction(formData);

    expect(result.publishedVersion).toBeGreaterThan(0);
    const holder = getHolder(id)!;
    expect(holder.pool).toBe("B");
    expect(holder.tagNumber).toBe(950);
    expect(holder.confirmed).toBe(true);
    expect(listProvisionalHolders(SEASON_YEAR).some((h) => h.id === id)).toBe(false);
  });

  it("leaves the tag number null when the field is left blank", async () => {
    const id = addProvisional({ name: "Action Confirm Tagless", pdgaNumber: 950002 });

    const formData = new FormData();
    formData.set("id", String(id));
    formData.set("pool", "A");
    formData.set("tagNumber", "");
    formData.set("name", "Action Confirm Tagless");
    formData.set("entryDate", "2026-05-01T00:00:00.000Z");

    await confirmHolderAction(formData);

    expect(getHolder(id)!.tagNumber).toBeNull();
  });
});

describe("mergeProvisionalIntoHolderAction", () => {
  it("parses the form and re-points the provisional's results to the target", async () => {
    const provisionalId = addProvisional({ name: "Action Merge Source", pdgaNumber: 950003 });
    const targetId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Action Merge Target",
      tagNumber: 951,
      pool: "A",
      entryDate: "2026-05-01T00:00:00.000Z",
      pdgaNumber: null,
      pdgaMembership: true,
    });

    const [event] = listEvents(SEASON_YEAR);
    expect(event).toBeDefined();
    insertResult({
      seasonYear: SEASON_YEAR,
      eventId: event!.id,
      pdgaNumber: 950003,
      displayName: "Action Merge Source",
      holderId: provisionalId,
      rawScoreToPar: -1,
    });

    const formData = new FormData();
    formData.set("provisionalId", String(provisionalId));
    formData.set("targetHolderId", String(targetId));

    const result = await mergeProvisionalIntoHolderAction(formData);

    expect(result.publishedVersion).toBeGreaterThan(0);
    const rows = listResultsBySeason(SEASON_YEAR).filter((r) => r.pdgaNumber === 950003);
    expect(rows.every((r) => r.holderId === targetId)).toBe(true);
    expect(getHolder(provisionalId)!.active).toBe(false);

    const sticky = getMatch(SEASON_YEAR, 950003)!;
    expect(sticky.holderId).toBe(targetId);
    expect(sticky.decidedBy).toBe(DIRECTOR);
  });
});

describe("markNonHolderAction — excluding a provisional holder", () => {
  it("reverts results to holderId=null and deactivates the provisional record", async () => {
    const provisionalId = addProvisional({ name: "Action Exclude Me", pdgaNumber: 950004 });
    const [event] = listEvents(SEASON_YEAR);
    expect(event).toBeDefined();
    insertResult({
      seasonYear: SEASON_YEAR,
      eventId: event!.id,
      pdgaNumber: 950004,
      displayName: "Action Exclude Me",
      holderId: provisionalId,
      rawScoreToPar: 3,
    });

    const formData = new FormData();
    formData.set("pdgaNumber", "950004");

    const result = await markNonHolderAction(formData);

    expect(result.publishedVersion).toBeGreaterThan(0);
    const rows = listResultsBySeason(SEASON_YEAR).filter((r) => r.pdgaNumber === 950004);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.holderId === null)).toBe(true);
    expect(getHolder(provisionalId)!.active).toBe(false);
  });
});
