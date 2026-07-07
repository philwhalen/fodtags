// Read-model build coverage for a provisional (auto-added, not-yet-
// confirmed) holder — plans/auto-add-players/02-null-tag-tiebreak-and-slug.md.
// Asserts the published `players` index row and `players/{slug}` profile
// payload carry `tagNumber: null` + `provisional: true` end to end through
// buildAndPublish, without depending on the auto-add pipeline (sub-plan 03)
// that will eventually create such a holder — inserting one directly here
// exercises the same read-model contract in isolation.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PublicPlayersIndexPayload, PublicProfilePayload } from "@/lib";

const SEASON_YEAR = 2026;

let tempDir: string;
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
  pdgaNumber?: number | null;
  ratingAtEntry?: number | null;
  active?: boolean;
  pdgaMembership?: boolean;
  confirmed?: boolean;
}) => number;

let provisionalId: number;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "fodtags-vitest-players-build-"),
  );
  process.env.DATA_DIR = tempDir;

  const [{ applyMigrations }, { seed }, readmodel, readModelRepo, tagHoldersRepo] =
    await Promise.all([
      import("@server/db/migrate"),
      import("@server/db/seed"),
      import("@server/readmodel"),
      import("@server/db/repositories/readModel"),
      import("@server/db/repositories/tagHolders"),
    ]);

  buildAndPublish = readmodel.buildAndPublish;
  getPublished = readModelRepo.getPublished;
  insertHolder = tagHoldersRepo.insertHolder;

  applyMigrations();
  seed();

  provisionalId = insertHolder({
    seasonYear: SEASON_YEAR,
    name: "Provisional Newcomer",
    tagNumber: null,
    pool: "A",
    entryDate: "2026-05-01",
    pdgaNumber: 999888,
    pdgaMembership: true,
    confirmed: false,
  });
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

describe("read model: provisional (auto-added, unconfirmed) holder payloads", () => {
  it("players index row carries tagNumber: null and provisional: true", () => {
    buildAndPublish(SEASON_YEAR);
    const view = getPublished(SEASON_YEAR, "players");
    expect(view).toBeDefined();
    const payload = view!.payload as PublicPlayersIndexPayload;

    const row = payload.holders.find((h) => h.holderId === provisionalId);
    expect(row).toBeDefined();
    expect(row!.tagNumber).toBeNull();
    expect(row!.provisional).toBe(true);
  });

  it("profile payload carries tagNumber: null and provisional: true", () => {
    buildAndPublish(SEASON_YEAR);
    const indexView = getPublished(SEASON_YEAR, "players");
    const indexPayload = indexView!.payload as PublicPlayersIndexPayload;
    const slug = indexPayload.holders.find((h) => h.holderId === provisionalId)!.slug;

    const profileView = getPublished(SEASON_YEAR, `players/${slug}`);
    expect(profileView).toBeDefined();
    const profile = profileView!.payload as PublicProfilePayload;

    expect(profile.tagNumber).toBeNull();
    expect(profile.provisional).toBe(true);
  });
});
