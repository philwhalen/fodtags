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
import { getEntryCount, upsertEntryCount } from "@server/db/repositories/entryCounts";
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
  findHolderByTagNumber,
  getHolder,
  insertHolder,
  updateHolder,
} from "@server/db/repositories/tagHolders";
import { getMatch, upsertMatch } from "@server/db/repositories/playerMatches";
import type { Pool } from "@server/db/schema";
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

// --- Player matching review queue (Spec 10 §10.4) ---

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
