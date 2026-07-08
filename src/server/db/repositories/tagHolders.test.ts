// tagHolders repository tests (auto-add sub-plan 01): the nullable
// `tagNumber` + `confirmed` foundation everything else in the feature keys
// off. Same dynamic-import pattern as domainSchema.test.ts / review-queue.test.ts
// (see either file's header comment for why): `@server/config` freezes
// `process.env` at first import, so `DATA_DIR` must be set before any server
// module is imported, and every server import below is deferred into
// `beforeAll`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SEASON_YEAR = 2026;

let tempDir: string;
let insertHolder: typeof import("@server/db/repositories/tagHolders").insertHolder;
let listHolders: typeof import("@server/db/repositories/tagHolders").listHolders;
let getHolder: typeof import("@server/db/repositories/tagHolders").getHolder;
let findHolderByTagNumber: typeof import("@server/db/repositories/tagHolders").findHolderByTagNumber;
let listProvisionalHolders: typeof import("@server/db/repositories/tagHolders").listProvisionalHolders;
let updateHolder: typeof import("@server/db/repositories/tagHolders").updateHolder;
// `currentTagNumber` has no dedicated repo setter yet (sub-plan 04 writes
// it back inside the publish transaction) — these tests exercise the raw
// column/index directly via the drizzle client, same as `insertSeasonRow`
// does in domainSchema.test.ts.
let setCurrentTagNumber: (id: number, currentTagNumber: number | null) => void;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-vitest-tagholders-"));
  process.env.DATA_DIR = tempDir;

  const [{ applyMigrations }, { seed }, tagHoldersRepo, dbClientMod, schemaMod, drizzleOrmMod] =
    await Promise.all([
      import("@server/db/migrate"),
      import("@server/db/seed"),
      import("@server/db/repositories/tagHolders"),
      import("@server/db/client"),
      import("@server/db/schema"),
      import("drizzle-orm"),
    ]);

  insertHolder = tagHoldersRepo.insertHolder;
  listHolders = tagHoldersRepo.listHolders;
  getHolder = tagHoldersRepo.getHolder;
  findHolderByTagNumber = tagHoldersRepo.findHolderByTagNumber;
  listProvisionalHolders = tagHoldersRepo.listProvisionalHolders;
  updateHolder = tagHoldersRepo.updateHolder;

  const { db } = dbClientMod;
  const { tagHolders } = schemaMod;
  const { eq } = drizzleOrmMod;
  setCurrentTagNumber = (id, currentTagNumber) => {
    db.update(tagHolders).set({ currentTagNumber }).where(eq(tagHolders.id, id)).run();
  };

  applyMigrations();
  seed();
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

describe("tagHolders repository: nullable tagNumber + confirmed (sub-plan 01)", () => {
  it("inserts a holder with a null tag number and confirmed=false; listHolders returns it as-is", () => {
    const id = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Provisional One",
      tagNumber: null,
      pool: "A",
      entryDate: "2026-06-01T00:00:00.000Z",
      pdgaNumber: 555001,
      ratingAtEntry: 900,
      pdgaMembership: true,
      confirmed: false,
    });

    const row = getHolder(id);
    expect(row?.tagNumber).toBeNull();
    expect(row?.confirmed).toBe(false);

    const listed = listHolders(SEASON_YEAR).find((h) => h.id === id);
    expect(listed?.tagNumber).toBeNull();
    expect(listed?.confirmed).toBe(false);
  });

  it("omitting confirmed on insert defaults to true (existing/seeded/admin-created holders)", () => {
    const id = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Default Confirmed",
      tagNumber: 901,
      pool: "A",
      entryDate: "2026-06-01T00:00:00.000Z",
    });

    expect(getHolder(id)?.confirmed).toBe(true);
  });

  it("two holders with a null tag number coexist without a unique-index violation", () => {
    const firstId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Provisional Two",
      tagNumber: null,
      pool: "A",
      entryDate: "2026-06-02T00:00:00.000Z",
      pdgaNumber: 555002,
      confirmed: false,
    });
    const secondId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Provisional Three",
      tagNumber: null,
      pool: "B",
      entryDate: "2026-06-03T00:00:00.000Z",
      pdgaNumber: 555003,
      confirmed: false,
    });

    expect(firstId).not.toBe(secondId);
    expect(getHolder(firstId)?.tagNumber).toBeNull();
    expect(getHolder(secondId)?.tagNumber).toBeNull();
  });

  it("findHolderByTagNumber returns undefined for a null argument and still finds a real duplicate", () => {
    expect(findHolderByTagNumber(SEASON_YEAR, null)).toBeUndefined();

    const id = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Tag Nine Oh Two",
      tagNumber: 902,
      pool: "A",
      entryDate: "2026-06-04T00:00:00.000Z",
    });

    const conflict = findHolderByTagNumber(SEASON_YEAR, 902);
    expect(conflict?.id).toBe(id);

    // excludeId lets a holder "find itself" without colliding.
    expect(findHolderByTagNumber(SEASON_YEAR, 902, id)).toBeUndefined();
  });

  it("listProvisionalHolders returns only confirmed=false && active, excluding confirmed and deactivated holders", () => {
    const provisionalId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Provisional Four",
      tagNumber: null,
      pool: "A",
      entryDate: "2026-06-05T00:00:00.000Z",
      pdgaNumber: 555004,
      confirmed: false,
    });
    const confirmedId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Confirmed Holder",
      tagNumber: 903,
      pool: "A",
      entryDate: "2026-06-05T00:00:00.000Z",
      confirmed: true,
    });
    const deactivatedProvisionalId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Deactivated Provisional",
      tagNumber: null,
      pool: "B",
      entryDate: "2026-06-05T00:00:00.000Z",
      pdgaNumber: 555005,
      confirmed: false,
    });
    updateHolder(deactivatedProvisionalId, { active: false });

    const provisional = listProvisionalHolders(SEASON_YEAR);
    const provisionalIds = provisional.map((h) => h.id);

    expect(provisionalIds).toContain(provisionalId);
    expect(provisionalIds).not.toContain(confirmedId);
    expect(provisionalIds).not.toContain(deactivatedProvisionalId);
    expect(provisional.every((h) => h.confirmed === false && h.active === true)).toBe(true);
  });
});

describe("tagHolders: currentTagNumber is a nullable, per-season-unique derived cache (tag-reassignment sub-plan 01)", () => {
  it("is null by default and `tagNumber` (the initial tag) is unaffected", () => {
    const id = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Current Tag Default",
      tagNumber: 950,
      pool: "A",
      entryDate: "2026-06-10T00:00:00.000Z",
    });

    const row = getHolder(id);
    expect(row?.currentTagNumber).toBeNull();
    expect(row?.tagNumber).toBe(950);
  });

  it("can be set independently of the initial tagNumber (they diverge after a reassignment)", () => {
    const id = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Current Tag Diverges",
      tagNumber: 951,
      pool: "A",
      entryDate: "2026-06-10T00:00:00.000Z",
    });

    setCurrentTagNumber(id, 3);

    const row = getHolder(id);
    // `tagNumber` (initial) never changes as tags churn night to night.
    expect(row?.tagNumber).toBe(951);
    expect(row?.currentTagNumber).toBe(3);
  });

  it("two holders with a null currentTagNumber coexist without a unique-index violation", () => {
    const firstId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Current Tag Null One",
      tagNumber: 952,
      pool: "A",
      entryDate: "2026-06-10T00:00:00.000Z",
    });
    const secondId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Current Tag Null Two",
      tagNumber: 953,
      pool: "B",
      entryDate: "2026-06-10T00:00:00.000Z",
    });

    expect(getHolder(firstId)?.currentTagNumber).toBeNull();
    expect(getHolder(secondId)?.currentTagNumber).toBeNull();
  });

  it("rejects a duplicate non-null currentTagNumber within the same season", () => {
    const firstId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Current Tag Dup One",
      tagNumber: 954,
      pool: "A",
      entryDate: "2026-06-10T00:00:00.000Z",
    });
    const secondId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Current Tag Dup Two",
      tagNumber: 955,
      pool: "A",
      entryDate: "2026-06-10T00:00:00.000Z",
    });

    setCurrentTagNumber(firstId, 12);
    expect(() => setCurrentTagNumber(secondId, 12)).toThrow();
  });

  it("current tags are free to permute — reassigning holder A's old current tag to holder B is not a collision once A moves off it", () => {
    const holderAId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Current Tag Permute A",
      tagNumber: 956,
      pool: "A",
      entryDate: "2026-06-10T00:00:00.000Z",
    });
    const holderBId = insertHolder({
      seasonYear: SEASON_YEAR,
      name: "Current Tag Permute B",
      tagNumber: 957,
      pool: "A",
      entryDate: "2026-06-10T00:00:00.000Z",
    });

    setCurrentTagNumber(holderAId, 20);
    setCurrentTagNumber(holderBId, 21);

    // Night's reassignment: A moves off 20 first, then B can take it.
    setCurrentTagNumber(holderAId, 21 + 1000); // move A off 20 to an unused number
    setCurrentTagNumber(holderBId, 20);

    expect(getHolder(holderAId)?.currentTagNumber).toBe(1021);
    expect(getHolder(holderBId)?.currentTagNumber).toBe(20);
  });
});
