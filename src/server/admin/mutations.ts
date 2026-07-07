// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import {
  AdminError,
  SEASON_YEAR,
  assertActor,
  poolBHighRatingWarning,
} from "@server/admin/context";
import { recordAudit } from "@server/db/repositories/auditLog";
import {
  getEntryCount,
  upsertAceCount,
  upsertEntryCount,
} from "@server/db/repositories/entryCounts";
import {
  deleteAdjustment as deleteAdjustmentRow,
  getAdjustment,
  insertAdjustment,
} from "@server/db/repositories/financialAdjustments";
import { getOpenings, upsertOpenings as upsertOpeningsRow } from "@server/db/repositories/financialOpenings";
import {
  deleteExpense as deleteExpenseRow,
  getExpense,
  insertExpense,
} from "@server/db/repositories/expenses";
import {
  deletePayout as deletePayoutRow,
  getPayout,
  insertPayout,
} from "@server/db/repositories/payouts";
import {
  deleteTagSale as deleteTagSaleRow,
  getTagSale,
  insertTagSale,
} from "@server/db/repositories/tagSales";
import { getEvent, updateEvent } from "@server/db/repositories/events";
import { getResult, updateResult, setHolderIdByPdgaNumber } from "@server/db/repositories/eventResults";
import {
  getSource,
  insertSource,
  setSourceStale,
  updateSource,
  type NewEventSourceInput,
} from "@server/db/repositories/eventSources";
import { insertSwitch } from "@server/db/repositories/poolSwitches";
import {
  findActiveProvisionalHolderByPdgaNumber,
  findHolderByTagNumber,
  getHolder,
  insertHolder,
  updateHolder,
} from "@server/db/repositories/tagHolders";
import { getMatch, upsertMatch } from "@server/db/repositories/playerMatches";
import type {
  ExpenseCategory,
  FundId,
  PayoutKind,
  Pool,
  SubLeagueType,
} from "@server/db/schema";
import { recompute } from "@server/readmodel/recompute";

export interface MutationResult {
  publishedVersion: number;
  warning?: string;
}

async function commitAndPublish(input: {
  seasonYear: number;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}): Promise<number> {
  recordAudit(input);
  return recompute(input.seasonYear);
}

function assertUniqueTag(seasonYear: number, tagNumber: number, excludeId?: number): void {
  const existing = findHolderByTagNumber(seasonYear, tagNumber, excludeId);
  if (existing) {
    throw new AdminError(`Tag number ${tagNumber} is already assigned to ${existing.name}.`);
  }
}

// --- Roster (Spec 10 §10.2) ---

export interface CreateHolderInput {
  name: string;
  tagNumber: number;
  pool: Pool;
  entryDate: string;
  pdgaNumber?: number | null;
  ratingAtEntry?: number | null;
  active?: boolean;
  pdgaMembership?: boolean;
}

export async function createHolder(
  input: CreateHolderInput,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  if (!input.name.trim()) {
    throw new AdminError("Name is required.");
  }
  assertUniqueTag(SEASON_YEAR, input.tagNumber);

  const id = insertHolder({ seasonYear: SEASON_YEAR, ...input });
  const after = getHolder(id);
  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "create",
    entityType: "tag_holder",
    entityId: String(id),
    after,
  });

  return {
    publishedVersion,
    warning: poolBHighRatingWarning(input.pool, input.ratingAtEntry),
  };
}

export interface UpdateHolderInput {
  id: number;
  name?: string;
  tagNumber?: number;
  pool?: Pool;
  entryDate?: string;
  pdgaNumber?: number | null;
  ratingAtEntry?: number | null;
  active?: boolean;
  pdgaMembership?: boolean;
}

export async function updateHolderRecord(
  input: UpdateHolderInput,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  const before = getHolder(input.id);
  if (!before) {
    throw new AdminError("Holder not found.", "not_found");
  }

  if (input.tagNumber !== undefined) {
    assertUniqueTag(SEASON_YEAR, input.tagNumber, input.id);
  }

  const { id, ...patch } = input;
  updateHolder(id, patch);
  const after = getHolder(id);
  const pool = patch.pool ?? before.pool;
  const rating = patch.ratingAtEntry !== undefined ? patch.ratingAtEntry : before.ratingAtEntry;

  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "update",
    entityType: "tag_holder",
    entityId: String(id),
    before,
    after,
  });

  return { publishedVersion, warning: poolBHighRatingWarning(pool, rating) };
}

export async function deleteHolder(id: number, actorEmail: string | null): Promise<MutationResult> {
  assertActor(actorEmail);
  const before = getHolder(id);
  if (!before) {
    throw new AdminError("Holder not found.", "not_found");
  }

  updateHolder(id, { active: false });
  const after = getHolder(id);
  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "deactivate",
    entityType: "tag_holder",
    entityId: String(id),
    before,
    after,
  });
  return { publishedVersion };
}

export interface PoolSwitchInput {
  holderId: number;
  effectiveDate: string;
  toPool: Pool;
}

export async function recordPoolSwitch(
  input: PoolSwitchInput,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  const holder = getHolder(input.holderId);
  if (!holder) {
    throw new AdminError("Holder not found.", "not_found");
  }
  if (holder.pool === input.toPool) {
    throw new AdminError(`Holder is already in Pool ${input.toPool}.`);
  }

  const switchId = insertSwitch({
    seasonYear: SEASON_YEAR,
    holderId: input.holderId,
    effectiveDate: input.effectiveDate,
    fromPool: holder.pool,
    toPool: input.toPool,
    approvedBy: actorEmail,
  });

  updateHolder(input.holderId, { pool: input.toPool });
  const after = getHolder(input.holderId);

  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "pool_switch",
    entityType: "pool_switch",
    entityId: String(switchId),
    before: holder,
    after,
  });

  return { publishedVersion };
}

// --- Event sources (Spec 10 §10.3) ---

export async function registerEventSource(
  input: NewEventSourceInput,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  const id = insertSource({ ...input, seasonYear: SEASON_YEAR });
  const after = getSource(id);
  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "create",
    entityType: "event_source",
    entityId: String(id),
    after,
  });
  return { publishedVersion };
}

export async function updateEventSource(
  id: number,
  patch: Parameters<typeof updateSource>[1],
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  const before = getSource(id);
  if (!before) {
    throw new AdminError("Event source not found.", "not_found");
  }

  updateSource(id, patch);
  const after = getSource(id);
  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "update",
    entityType: "event_source",
    entityId: String(id),
    before,
    after,
  });
  return { publishedVersion };
}

export async function markSubLeagueComplete(
  sourceId: number,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  const before = getSource(sourceId);
  if (!before) {
    throw new AdminError("Event source not found.", "not_found");
  }
  if (!["EARLY", "MID", "LATE"].includes(before.type)) {
    throw new AdminError("Only sub-league sources can be marked complete.");
  }

  updateSource(sourceId, { complete: true });
  const after = getSource(sourceId);
  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "mark_complete",
    entityType: "event_source",
    entityId: String(sourceId),
    before,
    after,
  });
  return { publishedVersion };
}

/** Admin mark-stale / clear-stale (Spec 10 §10.7). */
export async function setEventSourceStale(
  sourceId: number,
  stale: boolean,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  const before = getSource(sourceId);
  if (!before) {
    throw new AdminError("Event source not found.", "not_found");
  }

  setSourceStale(sourceId, stale);
  const after = getSource(sourceId);
  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: stale ? "mark_stale" : "clear_stale",
    entityType: "event_source",
    entityId: String(sourceId),
    before,
    after,
  });
  return { publishedVersion };
}

// --- Entry counts (Spec 10 §10.6) ---

export async function setEntryCount(
  eventId: number,
  paidEntries: number,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  const event = getEvent(eventId);
  if (!event) {
    throw new AdminError("Event not found.", "not_found");
  }
  if (paidEntries < 0) {
    throw new AdminError("Paid entries must be non-negative.");
  }

  const beforeRow = getEntryCount(eventId);
  const before = beforeRow ? { eventId, paidEntries: beforeRow.paidEntries } : null;
  upsertEntryCount({ seasonYear: SEASON_YEAR, eventId, paidEntries });
  const after = { eventId, paidEntries };

  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "upsert",
    entityType: "entry_count",
    entityId: String(eventId),
    before,
    after,
  });
  return { publishedVersion };
}

// --- Adjustments (Spec 10 §10.5) ---

export async function cancelEvent(eventId: number, actorEmail: string | null): Promise<MutationResult> {
  assertActor(actorEmail);
  const before = getEvent(eventId);
  if (!before) {
    throw new AdminError("Event not found.", "not_found");
  }

  updateEvent(eventId, { canceled: true });
  const after = getEvent(eventId);
  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "cancel",
    entityType: "event",
    entityId: String(eventId),
    before,
    after,
  });
  return { publishedVersion };
}

export async function setTagNotPresent(
  resultId: number,
  tagPresent: boolean,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  const before = getResult(resultId);
  if (!before) {
    throw new AdminError("Result not found.", "not_found");
  }

  updateResult(resultId, { tagPresent });
  const after = getResult(resultId);
  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: tagPresent ? "tag_present" : "tag_not_present",
    entityType: "event_result",
    entityId: String(resultId),
    before,
    after,
  });
  return { publishedVersion };
}

// --- Provisional holder confirm / merge / exclude (Spec 03 §3.5/§3.6,
// Spec 10 §10.4 "section A") ---

export interface ConfirmHolderInput {
  id: number;
  pool: Pool;
  tagNumber?: number | null;
  name?: string;
  entryDate?: string;
  ratingAtEntry?: number | null;
  pdgaMembership?: boolean;
}

/**
 * A director confirms an auto-added provisional holder: assigns a pool
 * (required) and, optionally, a tag number and/or corrections to the
 * scrape-seeded fields. A tagless confirmed holder is valid — it keeps
 * scoring, it just no longer shows the "pending confirmation" badge.
 *
 * Re-confirming an already-confirmed holder is rejected outright (rather
 * than silently no-op'ing) — this action is specifically "leave the
 * provisional state," and a holder that's already left it has no provisional
 * state left to leave; callers (the section-A confirm form) only ever see
 * this holder while it's still in `listProvisionalHolders`, so in practice
 * this only fires on a stale/double-submitted form.
 */
export async function confirmHolder(
  input: ConfirmHolderInput,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  const before = getHolder(input.id);
  if (!before) {
    throw new AdminError("Holder not found.", "not_found");
  }
  if (before.confirmed) {
    throw new AdminError("Holder is already confirmed.");
  }

  if (input.tagNumber != null) {
    assertUniqueTag(SEASON_YEAR, input.tagNumber, input.id);
  }

  const { id, ...patch } = input;
  updateHolder(id, { ...patch, confirmed: true });
  const after = getHolder(id);

  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "confirm",
    entityType: "tag_holder",
    entityId: String(id),
    before,
    after,
  });

  return {
    publishedVersion,
    warning: poolBHighRatingWarning(input.pool, input.ratingAtEntry ?? before.ratingAtEntry),
  };
}

/**
 * A director merges a provisional (duplicate) holder into an existing
 * holder — the common case being the same player already on the roster
 * under a slightly different name than the scrape reported. Re-points this
 * season's results by the provisional's PDGA # (the sticky key), records a
 * sticky admin link on that PDGA # so a future refresh never re-splits it,
 * and retires (deactivates, never hard-deletes) the provisional record —
 * it drops out of the `players` index because that index filters `active`
 * (see `build.ts`'s `activeHolders`).
 */
export async function mergeProvisionalIntoHolder(
  provisionalId: number,
  targetHolderId: number,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  if (provisionalId === targetHolderId) {
    throw new AdminError("Cannot merge a holder into itself.");
  }

  const provisional = getHolder(provisionalId);
  if (!provisional) {
    throw new AdminError("Provisional holder not found.", "not_found");
  }
  const target = getHolder(targetHolderId);
  if (!target) {
    throw new AdminError("Target holder not found.", "not_found");
  }
  if (provisional.pdgaNumber == null) {
    throw new AdminError("Provisional holder has no PDGA number to re-point.");
  }

  setHolderIdByPdgaNumber(SEASON_YEAR, provisional.pdgaNumber, targetHolderId);
  upsertMatch({
    seasonYear: SEASON_YEAR,
    pdgaNumber: provisional.pdgaNumber,
    holderId: targetHolderId,
    source: "admin",
    decidedBy: actorEmail,
  });
  updateHolder(provisionalId, { active: false });

  const match = getMatch(SEASON_YEAR, provisional.pdgaNumber);
  const after = { target: getHolder(targetHolderId), match };

  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "merge",
    entityType: "tag_holder",
    entityId: String(provisionalId),
    before: provisional,
    after,
  });
  return { publishedVersion };
}

// --- Player matching review queue (Spec 10 §10.4 "section B") ---

export async function linkEntrant(
  pdgaNumber: number,
  holderId: number,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  const holder = getHolder(holderId);
  if (!holder) {
    throw new AdminError("Holder not found.", "not_found");
  }

  const before = getMatch(SEASON_YEAR, pdgaNumber) ?? null;
  upsertMatch({
    seasonYear: SEASON_YEAR,
    pdgaNumber,
    holderId,
    source: "admin",
    decidedBy: actorEmail,
  });
  setHolderIdByPdgaNumber(SEASON_YEAR, pdgaNumber, holderId);
  const after = getMatch(SEASON_YEAR, pdgaNumber);

  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "link",
    entityType: "player_match",
    entityId: String(pdgaNumber),
    before,
    after,
  });
  return { publishedVersion };
}

export interface CreateHolderForEntrantInput extends CreateHolderInput {
  pdgaNumber: number;
}

export async function createHolderForEntrant(
  input: CreateHolderForEntrantInput,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  if (!input.name.trim()) {
    throw new AdminError("Name is required.");
  }
  assertUniqueTag(SEASON_YEAR, input.tagNumber);

  const id = insertHolder({ seasonYear: SEASON_YEAR, ...input, pdgaNumber: input.pdgaNumber });
  const holder = getHolder(id);

  upsertMatch({
    seasonYear: SEASON_YEAR,
    pdgaNumber: input.pdgaNumber,
    holderId: id,
    source: "admin",
    decidedBy: actorEmail,
  });
  setHolderIdByPdgaNumber(SEASON_YEAR, input.pdgaNumber, id);
  const match = getMatch(SEASON_YEAR, input.pdgaNumber);

  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "create_and_link",
    entityType: "player_match",
    entityId: String(input.pdgaNumber),
    after: { holder, match },
  });

  return {
    publishedVersion,
    warning: poolBHighRatingWarning(input.pool, input.ratingAtEntry),
  };
}

export async function markNonHolder(
  pdgaNumber: number,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);

  const before = getMatch(SEASON_YEAR, pdgaNumber) ?? null;
  upsertMatch({
    seasonYear: SEASON_YEAR,
    pdgaNumber,
    holderId: null,
    source: "admin",
    decidedBy: actorEmail,
  });
  setHolderIdByPdgaNumber(SEASON_YEAR, pdgaNumber, null);

  // Sub-plan 04: excluding an auto-added provisional holder's entrant
  // should retire the provisional record too, so it stops appearing as a
  // roster/scoring holder. `findActiveProvisionalHolderByPdgaNumber` only
  // ever matches `confirmed = false` rows — a director-confirmed holder on
  // this PDGA # (e.g. one linked via `linkEntrant`) is never touched here.
  const provisional = findActiveProvisionalHolderByPdgaNumber(SEASON_YEAR, pdgaNumber);
  if (provisional) {
    updateHolder(provisional.id, { active: false });
  }

  const after = getMatch(SEASON_YEAR, pdgaNumber);

  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "mark_non_holder",
    entityType: "player_match",
    entityId: String(pdgaNumber),
    before,
    after,
  });
  return { publishedVersion };
}

// --- Financial inputs (Spec 10 §10.6) ---

const CALENDAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertCalendarDate(raw: string, label = "Date"): string {
  const trimmed = raw.trim();
  if (!CALENDAR_DATE_RE.test(trimmed)) {
    throw new AdminError(`${label} must be YYYY-MM-DD.`);
  }
  return trimmed;
}

function datePart(iso: string): string {
  return iso.slice(0, 10);
}

function assertExpenseCategory(category: ExpenseCategory): void {
  const valid: ExpenseCategory[] = ["pdga_fees", "trophies", "ctp", "contingency", "other"];
  if (!valid.includes(category)) {
    throw new AdminError("Invalid expense category.");
  }
}

function assertFundId(fund: FundId): void {
  const valid: FundId[] = [
    "reserves",
    "ace",
    "olp:EARLY",
    "olp:MID",
    "olp:LATE",
    "skins:A",
    "skins:B",
  ];
  if (!valid.includes(fund)) {
    throw new AdminError("Invalid fund.");
  }
}

export async function setAceCount(
  eventId: number,
  aceEntries: number,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  const event = getEvent(eventId);
  if (!event) {
    throw new AdminError("Event not found.", "not_found");
  }
  if (aceEntries < 0) {
    throw new AdminError("Ace entries must be non-negative.");
  }

  const beforeRow = getEntryCount(eventId);
  const before = beforeRow
    ? { eventId, aceEntries: beforeRow.aceEntries }
    : { eventId, aceEntries: 0 };
  upsertAceCount({ seasonYear: SEASON_YEAR, eventId, aceEntries });
  const after = { eventId, aceEntries };

  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "upsert_ace",
    entityType: "entry_count",
    entityId: String(eventId),
    before,
    after,
  });
  return { publishedVersion };
}

export interface UpsertOpeningsInput {
  aceOpeningCents: number;
  reservesOpeningCents: number;
}

export async function upsertOpenings(
  input: UpsertOpeningsInput,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  if (input.aceOpeningCents < 0 || input.reservesOpeningCents < 0) {
    throw new AdminError("Opening balances must be non-negative.");
  }

  const before = getOpenings(SEASON_YEAR) ?? null;
  upsertOpeningsRow({
    seasonYear: SEASON_YEAR,
    aceOpeningCents: input.aceOpeningCents,
    reservesOpeningCents: input.reservesOpeningCents,
  });
  const after = getOpenings(SEASON_YEAR);

  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "upsert",
    entityType: "financial_openings",
    entityId: String(SEASON_YEAR),
    before,
    after,
  });
  return { publishedVersion };
}

export interface AddTagSaleInput {
  saleDate: string;
  count: number;
  note?: string | null;
}

export async function addTagSale(
  input: AddTagSaleInput,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  if (input.count <= 0) {
    throw new AdminError("Tag sale count must be positive.");
  }
  const saleDate = assertCalendarDate(input.saleDate, "Sale date");

  const id = insertTagSale({
    seasonYear: SEASON_YEAR,
    saleDate,
    count: input.count,
    note: input.note ?? null,
  });
  const after = getTagSale(id);

  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "create",
    entityType: "tag_sale",
    entityId: String(id),
    after,
  });
  return { publishedVersion };
}

export async function deleteTagSale(id: number, actorEmail: string | null): Promise<MutationResult> {
  assertActor(actorEmail);
  const before = getTagSale(id);
  if (!before) {
    throw new AdminError("Tag sale not found.", "not_found");
  }

  deleteTagSaleRow(id);
  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "delete",
    entityType: "tag_sale",
    entityId: String(id),
    before,
  });
  return { publishedVersion };
}

export interface RecordPayoutInput {
  kind: PayoutKind;
  paidDate: string;
  amountCents: number;
  subLeague?: SubLeagueType | null;
  pool?: Pool | null;
  recipientHolderId?: number | null;
  note?: string | null;
}

export async function recordPayout(
  input: RecordPayoutInput,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  if (input.amountCents <= 0) {
    throw new AdminError("Payout amount must be positive.");
  }
  const paidDate = assertCalendarDate(input.paidDate, "Paid date");

  if (input.kind === "OLP" && !input.subLeague) {
    throw new AdminError("OLP payouts require a sub-league.");
  }
  if (input.kind === "SKINS" && !input.pool) {
    throw new AdminError("Skins payouts require a pool.");
  }
  if (input.kind === "ACE") {
    if (input.recipientHolderId != null) {
      const holder = getHolder(input.recipientHolderId);
      if (!holder) {
        throw new AdminError("Holder not found.", "not_found");
      }
      if (datePart(paidDate) < datePart(holder.entryDate)) {
        throw new AdminError("No ace win before the recipient's tag purchase.");
      }
    } else if (input.amountCents > 5000) {
      throw new AdminError("Non-holder ace wins are capped at $50.");
    }
  }

  const id = insertPayout({
    seasonYear: SEASON_YEAR,
    kind: input.kind,
    paidDate,
    amountCents: input.amountCents,
    subLeague: input.subLeague ?? null,
    pool: input.pool ?? null,
    recipientHolderId: input.recipientHolderId ?? null,
    note: input.note ?? null,
  });
  const after = getPayout(id);

  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "create",
    entityType: "payout",
    entityId: String(id),
    after,
  });
  return { publishedVersion };
}

export async function deletePayout(id: number, actorEmail: string | null): Promise<MutationResult> {
  assertActor(actorEmail);
  const before = getPayout(id);
  if (!before) {
    throw new AdminError("Payout not found.", "not_found");
  }

  deletePayoutRow(id);
  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "delete",
    entityType: "payout",
    entityId: String(id),
    before,
  });
  return { publishedVersion };
}

export interface AddExpenseInput {
  spentDate: string;
  amountCents: number;
  category: ExpenseCategory;
  description: string;
}

export async function addExpense(
  input: AddExpenseInput,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  if (input.amountCents <= 0) {
    throw new AdminError("Expense amount must be positive.");
  }
  if (!input.description.trim()) {
    throw new AdminError("Expense description is required.");
  }
  assertExpenseCategory(input.category);
  const spentDate = assertCalendarDate(input.spentDate, "Spent date");

  const id = insertExpense({
    seasonYear: SEASON_YEAR,
    spentDate,
    amountCents: input.amountCents,
    category: input.category,
    description: input.description.trim(),
  });
  const after = getExpense(id);

  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "create",
    entityType: "expense",
    entityId: String(id),
    after,
  });
  return { publishedVersion };
}

export async function deleteExpense(id: number, actorEmail: string | null): Promise<MutationResult> {
  assertActor(actorEmail);
  const before = getExpense(id);
  if (!before) {
    throw new AdminError("Expense not found.", "not_found");
  }

  deleteExpenseRow(id);
  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "delete",
    entityType: "expense",
    entityId: String(id),
    before,
  });
  return { publishedVersion };
}

export interface AddAdjustmentInput {
  fund: FundId;
  deltaCents: number;
  adjustedDate: string;
  reason: string;
}

export async function addAdjustment(
  input: AddAdjustmentInput,
  actorEmail: string | null,
): Promise<MutationResult> {
  assertActor(actorEmail);
  if (input.deltaCents === 0) {
    throw new AdminError("Adjustment amount must be non-zero.");
  }
  if (!input.reason.trim()) {
    throw new AdminError("Adjustment reason is required.");
  }
  assertFundId(input.fund);
  const adjustedDate = assertCalendarDate(input.adjustedDate, "Adjusted date");

  const id = insertAdjustment({
    seasonYear: SEASON_YEAR,
    fund: input.fund,
    deltaCents: input.deltaCents,
    adjustedDate,
    reason: input.reason.trim(),
  });
  const after = getAdjustment(id);

  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "create",
    entityType: "financial_adjustment",
    entityId: String(id),
    after,
  });
  return { publishedVersion };
}

export async function deleteAdjustment(id: number, actorEmail: string | null): Promise<MutationResult> {
  assertActor(actorEmail);
  const before = getAdjustment(id);
  if (!before) {
    throw new AdminError("Adjustment not found.", "not_found");
  }

  deleteAdjustmentRow(id);
  const publishedVersion = await commitAndPublish({
    seasonYear: SEASON_YEAR,
    actorEmail,
    action: "delete",
    entityType: "financial_adjustment",
    entityId: String(id),
    before,
  });
  return { publishedVersion };
}
