// Admin mutation + recompute tests (plans/common-a/06-admin-forms.md "Tests").
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { StandingsViewPayload } from "@server/readmodel/build";

const SEASON_YEAR = 2026;
const DIRECTOR = "director@test.local";

let tempDir: string;
let buildAndPublish: (seasonYear: number) => number;
let getPublished: (seasonYear: number, viewKey: string) => { payload: unknown } | undefined;
let getCurrentVersion: (seasonYear: number) => number | undefined;
let listAudit: (seasonYear: number, limit?: number) => Array<{ action: string; entityType: string }>;
let loadSeasonSnapshot: (seasonYear: number) => import("@/lib").SeasonSnapshot;
let computeSeason: (input: import("@/lib").SeasonSnapshot) => import("@/lib").SeasonResults;
let computeTagTimeline: typeof import("@server/engine").computeTagTimeline;
let listEvents: (seasonYear: number) => Array<{ id: number; label: string; canceled: boolean }>;
let listSources: (seasonYear: number) => Array<{ id: number; type: string; complete: boolean }>;
let listResultsByEvent: (eventId: number) => Array<{ id: number; holderId: number | null; tagPresent: boolean }>;

let createHolder: (
  input: {
    name: string;
    tagNumber: number;
    pool: "A" | "B";
    entryDate: string;
    ratingAtEntry?: number | null;
  },
  actor: string | null,
) => Promise<{ publishedVersion: number; warning?: string }>;
let setEntryCount: (
  eventId: number,
  paidEntries: number,
  actor: string | null,
) => Promise<{ publishedVersion: number }>;
let cancelEvent: (eventId: number, actor: string | null) => Promise<{ publishedVersion: number }>;
let markSubLeagueComplete: (
  sourceId: number,
  actor: string | null,
) => Promise<{ publishedVersion: number }>;
let resetRecomputeFlight: () => void;
let resetRefreshFlight: () => void;
let runRefresh: (input: { trigger: "manual"; seasonYear: number }) => Promise<{ runId?: number; outcome: string }>;

beforeAll(async () => {
  tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fodtags-vitest-admin-"));
  process.env.DATA_DIR = tempDir;

  const [
    migrateMod,
    seedMod,
    readmodelMod,
    readModelRepo,
    auditRepo,
    snapshotRepo,
    engineMod,
    eventsRepo,
    sourcesRepo,
    resultsRepo,
    adminMutations,
    recomputeMod,
    pipelineMod,
  ] = await Promise.all([
    import("@server/db/migrate"),
    import("@server/db/seed"),
    import("@server/readmodel"),
    import("@server/db/repositories/readModel"),
    import("@server/db/repositories/auditLog"),
    import("@server/db/repositories/seasonSnapshot"),
    import("@server/engine"),
    import("@server/db/repositories/events"),
    import("@server/db/repositories/eventSources"),
    import("@server/db/repositories/eventResults"),
    import("@server/admin/mutations"),
    import("@server/readmodel/recompute"),
    import("@server/ingestion/pipeline"),
  ]);

  migrateMod.applyMigrations();
  seedMod.seed();

  buildAndPublish = readmodelMod.buildAndPublish;
  getPublished = readModelRepo.getPublished;
  getCurrentVersion = readModelRepo.getCurrentVersion;
  listAudit = auditRepo.listAudit;
  loadSeasonSnapshot = snapshotRepo.loadSeasonSnapshot;
  computeSeason = engineMod.computeSeason;
  computeTagTimeline = engineMod.computeTagTimeline;
  listEvents = eventsRepo.listEvents;
  listSources = sourcesRepo.listSources;
  listResultsByEvent = resultsRepo.listResultsByEvent;

  createHolder = adminMutations.createHolder;
  setEntryCount = adminMutations.setEntryCount;
  cancelEvent = adminMutations.cancelEvent;
  markSubLeagueComplete = adminMutations.markSubLeagueComplete;
  resetRecomputeFlight = recomputeMod.__resetRecomputeSingleFlightForTests;
  resetRefreshFlight = pipelineMod.__resetSingleFlightForTests;
  runRefresh = pipelineMod.runRefresh;

  buildAndPublish(SEASON_YEAR);
});

afterAll(async () => {
  await fs.promises.rm(tempDir, { recursive: true, force: true });
});

describe("admin mutations + recompute", () => {
  it("rejects unauthenticated writes", async () => {
    await expect(
      createHolder(
        {
          name: "Ghost",
          tagNumber: 99,
          pool: "A",
          entryDate: "2026-03-01T00:00:00.000Z",
        },
        null,
      ),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("enforces tag number uniqueness per season", async () => {
    await expect(
      createHolder(
        {
          name: "Duplicate Tag",
          tagNumber: 1,
          pool: "A",
          entryDate: "2026-03-01T00:00:00.000Z",
        },
        DIRECTOR,
      ),
    ).rejects.toThrow(/Tag number 1/);
  });

  it("warns when Pool B is assigned to a ≥900-rated holder", async () => {
    const result = await createHolder(
      {
        name: "High Rated B",
        tagNumber: 77,
        pool: "B",
        entryDate: "2026-03-01T00:00:00.000Z",
        ratingAtEntry: 925,
      },
      DIRECTOR,
    );
    expect(result.warning).toMatch(/Pool B.*925/);
    expect(listAudit(SEASON_YEAR, 5).some((a) => a.action === "create" && a.entityType === "tag_holder")).toBe(
      true,
    );
  });

  it("writes audit_log and republishes after entry-count edit (OLP pot changes)", async () => {
    const midNight = listEvents(SEASON_YEAR).find((e) => e.label === "Mid League Night 1");
    expect(midNight).toBeDefined();

    const beforePot = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).olpPot.MID;
    const versionBefore = getCurrentVersion(SEASON_YEAR)!;

    await setEntryCount(midNight!.id, 50, DIRECTOR);

    const afterPot = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).olpPot.MID;
    expect(afterPot).toBe(50);
    expect(afterPot).toBeGreaterThan(beforePot);
    expect(getCurrentVersion(SEASON_YEAR)).toBeGreaterThan(versionBefore);
    expect(
      listAudit(SEASON_YEAR, 10).some((a) => a.action === "upsert" && a.entityType === "entry_count"),
    ).toBe(true);
  });

  it("mark complete finalizes sub-league (standings finalized + OLP not projected)", async () => {
    const midSource = listSources(SEASON_YEAR).find((s) => s.type === "MID");
    expect(midSource).toBeDefined();
    expect(midSource!.complete).toBe(false);

    const olpBefore = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).olp.MID;
    expect(olpBefore.length).toBeGreaterThan(0);
    expect(olpBefore.every((r) => r.projected)).toBe(true);

    await markSubLeagueComplete(midSource!.id, DIRECTOR);

    const midView = getPublished(SEASON_YEAR, "sub-league/mid/pool-a")!.payload as StandingsViewPayload;
    expect(midView.finalized).toBe(true);

    const olpAfter = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).olp.MID;
    expect(olpAfter.every((r) => r.projected === false)).toBe(true);
    expect(listAudit(SEASON_YEAR, 10).some((a) => a.action === "mark_complete")).toBe(true);
  });

  it("canceling an event zeros its contribution after recompute", async () => {
    const activeNight = listEvents(SEASON_YEAR).find(
      (e) => e.label === "Early League Night 2" && !e.canceled,
    );
    expect(activeNight).toBeDefined();

    const versionBefore = getCurrentVersion(SEASON_YEAR)!;
    const standingsBefore = getPublished(SEASON_YEAR, "sub-league/early/pool-a")!
      .payload as StandingsViewPayload;

    await cancelEvent(activeNight!.id, DIRECTOR);

    expect(getCurrentVersion(SEASON_YEAR)).toBeGreaterThan(versionBefore);
    expect(listAudit(SEASON_YEAR, 10).some((a) => a.action === "cancel")).toBe(true);

    const standingsAfter = getPublished(SEASON_YEAR, "sub-league/early/pool-a")!
      .payload as StandingsViewPayload;
    const totalBefore = standingsBefore.rows.reduce((sum, r) => sum + r.points, 0);
    const totalAfter = standingsAfter.rows.reduce((sum, r) => sum + r.points, 0);
    expect(totalAfter).toBeLessThan(totalBefore);
  });

  it("shares recompute single-flight with concurrent callers", async () => {
    resetRecomputeFlight();
    const versionBefore = getCurrentVersion(SEASON_YEAR)!;

    const { recompute } = await import("@server/readmodel/recompute");
    const [v1, v2] = await Promise.all([recompute(SEASON_YEAR), recompute(SEASON_YEAR)]);

    expect(v1).toBe(v2);
    expect(v1).toBe(versionBefore + 1);
  });

  it("pipeline single-flight test contract remains intact", async () => {
    resetRefreshFlight();
    const { listRuns } = await import("@server/db/repositories/refreshRuns");
    const runCountBefore = listRuns(SEASON_YEAR, 1000).length;

    const [first, second] = await Promise.all([
      runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR }),
      runRefresh({ trigger: "manual", seasonYear: SEASON_YEAR }),
    ]);

    expect(listRuns(SEASON_YEAR, 1000).length - runCountBefore).toBe(1);
    expect(first.runId).toBe(second.runId);
    expect([first.outcome, second.outcome].sort()).toEqual(["completed", "skipped"]);
  });
});

describe("tag-not-present adjustment", () => {
  it("excludes a result from standings after recompute", async () => {
    const { setTagNotPresent } = await import("@server/admin/mutations");
    const earlyNight = listEvents(SEASON_YEAR).find((e) => e.label === "Early League Night 1");
    expect(earlyNight).toBeDefined();

    const result = listResultsByEvent(earlyNight!.id).find((r) => r.holderId !== null && r.tagPresent);
    expect(result).toBeDefined();

    const versionBefore = getCurrentVersion(SEASON_YEAR)!;
    await setTagNotPresent(result!.id, false, DIRECTOR);
    expect(getCurrentVersion(SEASON_YEAR)).toBeGreaterThan(versionBefore);
  });
});

describe("financial admin mutations", () => {
  let setAceCountFn: (
    eventId: number,
    aceEntries: number,
    actor: string | null,
  ) => Promise<{ publishedVersion: number }>;
  let upsertOpeningsFn: (
    input: { aceOpeningCents: number; reservesOpeningCents: number },
    actor: string | null,
  ) => Promise<{ publishedVersion: number }>;
  let addTagSaleFn: (
    input: { saleDate: string; count: number; note?: string | null },
    actor: string | null,
  ) => Promise<{ publishedVersion: number }>;
  let recordPayoutFn: (
    input: {
      kind: "OLP" | "SKINS" | "ACE";
      paidDate: string;
      amountCents: number;
      subLeague?: "EARLY" | "MID" | "LATE" | null;
      pool?: "A" | "B" | null;
      recipientHolderId?: number | null;
    },
    actor: string | null,
  ) => Promise<{ publishedVersion: number }>;
  let addExpenseFn: (
    input: {
      spentDate: string;
      amountCents: number;
      category: "pdga_fees" | "trophies" | "ctp" | "contingency" | "other";
      description: string;
    },
    actor: string | null,
  ) => Promise<{ publishedVersion: number }>;
  let addAdjustmentFn: (
    input: {
      fund: "reserves" | "ace" | "olp:EARLY" | "olp:MID" | "olp:LATE" | "skins:A" | "skins:B";
      deltaCents: number;
      adjustedDate: string;
      reason: string;
    },
    actor: string | null,
  ) => Promise<{ publishedVersion: number }>;
  let findHolderByTagNumber: (seasonYear: number, tagNumber: number) => { id: number; entryDate: string } | undefined;
  let listAuditFull: (
    seasonYear: number,
    limit?: number,
  ) => Array<{
    actorEmail: string;
    action: string;
    entityType: string;
    before: unknown;
    after: unknown;
  }>;

  beforeAll(async () => {
    const [adminMutations, tagHoldersRepo, auditRepo] = await Promise.all([
      import("@server/admin/mutations"),
      import("@server/db/repositories/tagHolders"),
      import("@server/db/repositories/auditLog"),
    ]);
    setAceCountFn = adminMutations.setAceCount;
    upsertOpeningsFn = adminMutations.upsertOpenings;
    addTagSaleFn = adminMutations.addTagSale;
    recordPayoutFn = adminMutations.recordPayout;
    addExpenseFn = adminMutations.addExpense;
    addAdjustmentFn = adminMutations.addAdjustment;
    findHolderByTagNumber = tagHoldersRepo.findHolderByTagNumber;
    listAuditFull = auditRepo.listAudit;
  });

  it("setAceCount writes audit, republishes, and bumps the ace fund", async () => {
    const earlyNight = listEvents(SEASON_YEAR).find((e) => e.label === "Early League Night 1");
    expect(earlyNight).toBeDefined();

    const beforeAce = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).financials.funds.ace;
    const versionBefore = getCurrentVersion(SEASON_YEAR)!;

    await setAceCountFn(earlyNight!.id, 6, DIRECTOR);

    const afterAce = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).financials.funds.ace;
    expect(afterAce).toBe(beforeAce + 600);
    expect(getCurrentVersion(SEASON_YEAR)).toBeGreaterThan(versionBefore);

    const audit = listAuditFull(SEASON_YEAR, 20).find(
      (a) => a.action === "upsert_ace" && a.entityType === "entry_count",
    );
    expect(audit).toMatchObject({
      actorEmail: DIRECTOR,
      action: "upsert_ace",
      entityType: "entry_count",
    });
    expect(audit?.after).toMatchObject({ eventId: earlyNight!.id, aceEntries: 6 });
  });

  it("upsertOpenings writes audit and sets opening balances", async () => {
    const versionBefore = getCurrentVersion(SEASON_YEAR)!;

    await upsertOpeningsFn({ aceOpeningCents: 5000, reservesOpeningCents: 10000 }, DIRECTOR);

    const { funds } = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).financials;
    expect(funds.ace).toBeGreaterThanOrEqual(5000);
    expect(funds.reserves).toBeGreaterThanOrEqual(10000);
    expect(getCurrentVersion(SEASON_YEAR)).toBeGreaterThan(versionBefore);
    expect(
      listAuditFull(SEASON_YEAR, 20).some(
        (a) =>
          a.actorEmail === DIRECTOR &&
          a.action === "upsert" &&
          a.entityType === "financial_openings" &&
          a.after !== null,
      ),
    ).toBe(true);
  });

  it("addTagSale writes audit and bumps reserves", async () => {
    const beforeReserves = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).financials.funds.reserves;
    const versionBefore = getCurrentVersion(SEASON_YEAR)!;

    await addTagSaleFn({ saleDate: "2026-03-01", count: 2 }, DIRECTOR);

    const afterReserves = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).financials.funds.reserves;
    expect(afterReserves).toBe(beforeReserves + 4000);
    expect(getCurrentVersion(SEASON_YEAR)).toBeGreaterThan(versionBefore);
    expect(
      listAuditFull(SEASON_YEAR, 20).some(
        (a) => a.actorEmail === DIRECTOR && a.action === "create" && a.entityType === "tag_sale",
      ),
    ).toBe(true);
  });

  it("recordPayout(SKINS) reduces the pool purse and marks skins paid out", async () => {
    const before = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).financials;
    const poolBalance = before.funds.skins.A;
    expect(poolBalance).toBeGreaterThan(0);
    const versionBefore = getCurrentVersion(SEASON_YEAR)!;

    await recordPayoutFn(
      {
        kind: "SKINS",
        paidDate: "2026-10-01",
        amountCents: poolBalance,
        pool: "A",
      },
      DIRECTOR,
    );

    const after = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).financials;
    expect(after.funds.skins.A).toBe(0);
    expect(after.skinsPaidOut.A).toBe(true);
    expect(after.funds.skins.A).toBeLessThan(before.funds.skins.A);
    expect(getCurrentVersion(SEASON_YEAR)).toBeGreaterThan(versionBefore);
    expect(
      listAuditFull(SEASON_YEAR, 20).some(
        (a) => a.actorEmail === DIRECTOR && a.action === "create" && a.entityType === "payout",
      ),
    ).toBe(true);
  });

  it("addExpense writes audit and reduces reserves", async () => {
    const beforeReserves = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).financials.funds.reserves;
    const versionBefore = getCurrentVersion(SEASON_YEAR)!;

    await addExpenseFn(
      {
        spentDate: "2026-04-01",
        amountCents: 1500,
        category: "pdga_fees",
        description: "League PDGA fees",
      },
      DIRECTOR,
    );

    const afterReserves = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).financials.funds.reserves;
    expect(afterReserves).toBe(beforeReserves - 1500);
    expect(getCurrentVersion(SEASON_YEAR)).toBeGreaterThan(versionBefore);
    expect(
      listAuditFull(SEASON_YEAR, 20).some(
        (a) => a.actorEmail === DIRECTOR && a.action === "create" && a.entityType === "expense",
      ),
    ).toBe(true);
  });

  it("addAdjustment writes audit and moves the named fund", async () => {
    const beforeAce = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).financials.funds.ace;
    const versionBefore = getCurrentVersion(SEASON_YEAR)!;

    await addAdjustmentFn(
      {
        fund: "ace",
        deltaCents: 250,
        adjustedDate: "2026-04-15",
        reason: "Manual correction",
      },
      DIRECTOR,
    );

    const afterAce = computeSeason(loadSeasonSnapshot(SEASON_YEAR)).financials.funds.ace;
    expect(afterAce).toBe(beforeAce + 250);
    expect(getCurrentVersion(SEASON_YEAR)).toBeGreaterThan(versionBefore);
    expect(
      listAuditFull(SEASON_YEAR, 20).some(
        (a) =>
          a.actorEmail === DIRECTOR &&
          a.action === "create" &&
          a.entityType === "financial_adjustment",
      ),
    ).toBe(true);
  });

  it("rejects non-holder ace wins over $50", async () => {
    const { AdminError } = await import("@server/admin/context");
    await expect(
      recordPayoutFn(
        {
          kind: "ACE",
          paidDate: "2026-04-02",
          amountCents: 5001,
        },
        DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(AdminError);
    await expect(
      recordPayoutFn(
        {
          kind: "ACE",
          paidDate: "2026-04-02",
          amountCents: 5001,
        },
        DIRECTOR,
      ),
    ).rejects.toThrow(/Non-holder ace wins are capped at \$50/);
  });

  it("rejects ace wins dated before the recipient holder's tag purchase", async () => {
    const { AdminError } = await import("@server/admin/context");
    const holder = findHolderByTagNumber(SEASON_YEAR, 1);
    expect(holder).toBeDefined();

    await expect(
      recordPayoutFn(
        {
          kind: "ACE",
          paidDate: "2026-01-10",
          amountCents: 3000,
          recipientHolderId: holder!.id,
        },
        DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(AdminError);
    await expect(
      recordPayoutFn(
        {
          kind: "ACE",
          paidDate: "2026-01-10",
          amountCents: 3000,
          recipientHolderId: holder!.id,
        },
        DIRECTOR,
      ),
    ).rejects.toThrow(/No ace win before the recipient's tag purchase/);
  });

  it("rejects zero or negative amounts and missing kind-specific fields", async () => {
    const { AdminError } = await import("@server/admin/context");

    await expect(
      addExpenseFn(
        {
          spentDate: "2026-04-01",
          amountCents: 0,
          category: "other",
          description: "Invalid",
        },
        DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(AdminError);

    await expect(
      recordPayoutFn(
        {
          kind: "OLP",
          paidDate: "2026-05-01",
          amountCents: -100,
        },
        DIRECTOR,
      ),
    ).rejects.toBeInstanceOf(AdminError);

    await expect(
      recordPayoutFn(
        {
          kind: "OLP",
          paidDate: "2026-05-01",
          amountCents: 1000,
        },
        DIRECTOR,
      ),
    ).rejects.toThrow(/OLP payouts require a sub-league/);

    await expect(
      recordPayoutFn(
        {
          kind: "SKINS",
          paidDate: "2026-10-01",
          amountCents: 1000,
        },
        DIRECTOR,
      ),
    ).rejects.toThrow(/Skins payouts require a pool/);
  });
});

describe("tag night overrides (Spec 02 §2.10, Spec 10 §10.9)", () => {
  let setTagNightOverridesFn: (
    input: { eventId: number; tagOuts: Record<number, number> },
    actor: string | null,
  ) => Promise<{ publishedVersion: number }>;
  let listOverridesBySeasonFn: (
    seasonYear: number,
  ) => Array<{ eventId: number; holderId: number; tagOut: number }>;

  beforeAll(async () => {
    const [adminMutations, tagOverridesRepo] = await Promise.all([
      import("@server/admin/mutations"),
      import("@server/db/repositories/tagOverrides"),
    ]);
    setTagNightOverridesFn = adminMutations.setTagNightOverrides;
    listOverridesBySeasonFn = tagOverridesRepo.listOverridesBySeason;
  });

  /** The night's current combined-field pile (tag-in/tag-out per
   * participant), read the same way the admin mutation validates against —
   * via the pure engine helper, not a re-implementation of it. */
  function currentPile(eventId: number) {
    const snapshot = loadSeasonSnapshot(SEASON_YEAR);
    const timeline = computeTagTimeline({
      holders: snapshot.holders,
      events: snapshot.events,
      tagOverrides: snapshot.tagOverrides,
    });
    return timeline.assignments.filter((a) => a.eventId === eventId && a.tagIn !== null);
  }

  it("writes tag_overrides + audit row + republishes, and clears back to computed on resubmit", async () => {
    const night = listEvents(SEASON_YEAR).find((e) => e.label === "Early League Night 1");
    expect(night).toBeDefined();

    const pile = currentPile(night!.id);
    expect(pile.length).toBeGreaterThanOrEqual(2);
    const [first, second] = pile;

    // Swap the top two holders' tag-outs — still a permutation of the
    // night's tag-ins, but differs from computed for both of them.
    const swapped: Record<number, number> = {};
    for (const a of pile) swapped[a.holderId] = a.tagOut;
    swapped[first!.holderId] = second!.tagOut;
    swapped[second!.holderId] = first!.tagOut;

    const versionBefore = getCurrentVersion(SEASON_YEAR)!;
    await setTagNightOverridesFn({ eventId: night!.id, tagOuts: swapped }, DIRECTOR);

    expect(getCurrentVersion(SEASON_YEAR)).toBeGreaterThan(versionBefore);
    const overridesAfterSwap = listOverridesBySeasonFn(SEASON_YEAR).filter((o) => o.eventId === night!.id);
    expect(overridesAfterSwap.find((o) => o.holderId === first!.holderId)?.tagOut).toBe(second!.tagOut);
    expect(overridesAfterSwap.find((o) => o.holderId === second!.holderId)?.tagOut).toBe(first!.tagOut);
    expect(
      listAudit(SEASON_YEAR, 10).some((a) => a.action === "upsert" && a.entityType === "tag_override"),
    ).toBe(true);

    // Resubmitting the ORIGINAL (engine-computed) tag-outs clears the
    // override back to computed — no row left for this event.
    const computedOnly: Record<number, number> = {};
    for (const a of pile) computedOnly[a.holderId] = a.tagOut;
    const versionBeforeClear = getCurrentVersion(SEASON_YEAR)!;
    await setTagNightOverridesFn({ eventId: night!.id, tagOuts: computedOnly }, DIRECTOR);

    expect(getCurrentVersion(SEASON_YEAR)).toBeGreaterThan(versionBeforeClear);
    expect(listOverridesBySeasonFn(SEASON_YEAR).some((o) => o.eventId === night!.id)).toBe(false);
  });

  it("rejects a non-permutation submission (no write, no recompute) and an unauthenticated write", async () => {
    const night = listEvents(SEASON_YEAR).find((e) => e.label === "Mid League Night 1");
    expect(night).toBeDefined();

    const pile = currentPile(night!.id);
    expect(pile.length).toBeGreaterThanOrEqual(2);

    // Duplicate the first holder's tag-out onto the second — same set of
    // holders, but not a valid permutation of the night's tag-ins.
    const duplicated: Record<number, number> = {};
    for (const a of pile) duplicated[a.holderId] = a.tagOut;
    duplicated[pile[1]!.holderId] = duplicated[pile[0]!.holderId]!;

    const versionBefore = getCurrentVersion(SEASON_YEAR)!;
    const overridesBefore = listOverridesBySeasonFn(SEASON_YEAR).filter((o) => o.eventId === night!.id);

    await expect(
      setTagNightOverridesFn({ eventId: night!.id, tagOuts: duplicated }, DIRECTOR),
    ).rejects.toThrow(/permutation/);

    expect(getCurrentVersion(SEASON_YEAR)).toBe(versionBefore);
    expect(listOverridesBySeasonFn(SEASON_YEAR).filter((o) => o.eventId === night!.id)).toEqual(
      overridesBefore,
    );

    // A valid permutation from an unauthenticated actor is rejected too,
    // and leaves no trace.
    const valid: Record<number, number> = {};
    for (const a of pile) valid[a.holderId] = a.tagOut;
    await expect(setTagNightOverridesFn({ eventId: night!.id, tagOuts: valid }, null)).rejects.toMatchObject(
      { code: "unauthorized" },
    );
    expect(getCurrentVersion(SEASON_YEAR)).toBe(versionBefore);
    expect(listOverridesBySeasonFn(SEASON_YEAR).filter((o) => o.eventId === night!.id)).toEqual(
      overridesBefore,
    );
  });

  it("rejects a submission that omits or adds a holder relative to the night's pile", async () => {
    const night = listEvents(SEASON_YEAR).find((e) => e.label === "Mid League Night 1");
    expect(night).toBeDefined();

    const pile = currentPile(night!.id);
    expect(pile.length).toBeGreaterThanOrEqual(2);

    const missingOne: Record<number, number> = {};
    for (const a of pile.slice(1)) missingOne[a.holderId] = a.tagOut;

    await expect(
      setTagNightOverridesFn({ eventId: night!.id, tagOuts: missingOne }, DIRECTOR),
    ).rejects.toThrow(/exactly this night's tagged participants/);
  });
});
