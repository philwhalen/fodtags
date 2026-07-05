"use server";

import {
  AdminError,
  SEASON_YEAR,
  parseCheckbox,
  parseOptionalInt,
  parsePool,
  parseTagNumber,
} from "@server/admin/context";
import {
  cancelEvent,
  createHolder,
  createHolderForEntrant,
  linkEntrant,
  markNonHolder,
  markSubLeagueComplete,
  recordPoolSwitch,
  registerEventSource,
  setEntryCount,
  setEventSourceStale,
  setTagNotPresent,
  updateEventSource,
  updateHolderRecord,
  type MutationResult,
} from "@server/admin/mutations";
import { requireDirectorEmail } from "@server/admin/require-director";
import type { EventSourceType } from "@server/db/schema";

export async function createHolderAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  return createHolder(
    {
      name: String(formData.get("name") ?? "").trim(),
      tagNumber: parseTagNumber(String(formData.get("tagNumber") ?? "")),
      pool: parsePool(String(formData.get("pool") ?? "")),
      entryDate: String(formData.get("entryDate") ?? "").trim(),
      pdgaNumber: parseOptionalInt(String(formData.get("pdgaNumber") ?? "")),
      ratingAtEntry: parseOptionalInt(String(formData.get("ratingAtEntry") ?? "")),
      active: parseCheckbox(formData.get("active")),
      pdgaMembership: parseCheckbox(formData.get("pdgaMembership")),
    },
    actorEmail,
  );
}

export async function updateHolderAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  if (!Number.isFinite(id)) {
    throw new AdminError("Invalid holder id.");
  }
  return updateHolderRecord(
    {
      id,
      name: String(formData.get("name") ?? "").trim(),
      tagNumber: parseTagNumber(String(formData.get("tagNumber") ?? "")),
      pool: parsePool(String(formData.get("pool") ?? "")),
      entryDate: String(formData.get("entryDate") ?? "").trim(),
      pdgaNumber: parseOptionalInt(String(formData.get("pdgaNumber") ?? "")),
      ratingAtEntry: parseOptionalInt(String(formData.get("ratingAtEntry") ?? "")),
      active: parseCheckbox(formData.get("active")),
      pdgaMembership: parseCheckbox(formData.get("pdgaMembership")),
    },
    actorEmail,
  );
}

export async function poolSwitchAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const holderId = Number.parseInt(String(formData.get("holderId") ?? ""), 10);
  if (!Number.isFinite(holderId)) {
    throw new AdminError("Invalid holder id.");
  }
  return recordPoolSwitch(
    {
      holderId,
      effectiveDate: String(formData.get("effectiveDate") ?? "").trim(),
      toPool: parsePool(String(formData.get("toPool") ?? "")),
    },
    actorEmail,
  );
}

export async function registerSourceAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const type = String(formData.get("type") ?? "") as EventSourceType;
  const divisionsRaw = String(formData.get("divisions") ?? "").trim();
  const divisions = divisionsRaw === "" ? [] : divisionsRaw.split(",").map((d) => d.trim()).filter(Boolean);

  return registerEventSource(
    {
      seasonYear: SEASON_YEAR,
      pdgaEventId: String(formData.get("pdgaEventId") ?? "").trim(),
      type,
      label: String(formData.get("label") ?? "").trim(),
      active: parseCheckbox(formData.get("active")),
      startDate: String(formData.get("startDate") ?? "").trim() || null,
      endDate: String(formData.get("endDate") ?? "").trim() || null,
      divisions,
    },
    actorEmail,
  );
}

export async function updateSourceAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  if (!Number.isFinite(id)) {
    throw new AdminError("Invalid source id.");
  }
  const divisionsRaw = String(formData.get("divisions") ?? "").trim();
  const divisions = divisionsRaw === "" ? [] : divisionsRaw.split(",").map((d) => d.trim()).filter(Boolean);

  return updateEventSource(
    id,
    {
      pdgaEventId: String(formData.get("pdgaEventId") ?? "").trim(),
      label: String(formData.get("label") ?? "").trim(),
      active: parseCheckbox(formData.get("active")),
      startDate: String(formData.get("startDate") ?? "").trim() || null,
      endDate: String(formData.get("endDate") ?? "").trim() || null,
      divisions,
    },
    actorEmail,
  );
}

export async function markCompleteAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  if (!Number.isFinite(id)) {
    throw new AdminError("Invalid source id.");
  }
  return markSubLeagueComplete(id, actorEmail);
}

export async function setSourceStaleAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  if (!Number.isFinite(id)) {
    throw new AdminError("Invalid source id.");
  }
  const stale = String(formData.get("stale") ?? "") === "true";
  return setEventSourceStale(id, stale, actorEmail);
}

export async function setEntryCountAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const eventId = Number.parseInt(String(formData.get("eventId") ?? ""), 10);
  const paidEntries = Number.parseInt(String(formData.get("paidEntries") ?? ""), 10);
  if (!Number.isFinite(eventId) || !Number.isFinite(paidEntries)) {
    throw new AdminError("Invalid entry count input.");
  }
  return setEntryCount(eventId, paidEntries, actorEmail);
}

export async function cancelEventAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const eventId = Number.parseInt(String(formData.get("eventId") ?? ""), 10);
  if (!Number.isFinite(eventId)) {
    throw new AdminError("Invalid event id.");
  }
  return cancelEvent(eventId, actorEmail);
}

export async function tagNotPresentAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const resultId = Number.parseInt(String(formData.get("resultId") ?? ""), 10);
  if (!Number.isFinite(resultId)) {
    throw new AdminError("Invalid result id.");
  }
  return setTagNotPresent(resultId, false, actorEmail);
}

export async function linkEntrantAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const pdgaNumber = Number.parseInt(String(formData.get("pdgaNumber") ?? ""), 10);
  const holderId = Number.parseInt(String(formData.get("holderId") ?? ""), 10);
  if (!Number.isFinite(pdgaNumber) || !Number.isFinite(holderId)) {
    throw new AdminError("Invalid link input.");
  }
  return linkEntrant(pdgaNumber, holderId, actorEmail);
}

export async function createHolderForEntrantAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const pdgaNumber = Number.parseInt(String(formData.get("pdgaNumber") ?? ""), 10);
  if (!Number.isFinite(pdgaNumber)) {
    throw new AdminError("Invalid PDGA number.");
  }
  return createHolderForEntrant(
    {
      pdgaNumber,
      name: String(formData.get("name") ?? "").trim(),
      tagNumber: parseTagNumber(String(formData.get("tagNumber") ?? "")),
      pool: parsePool(String(formData.get("pool") ?? "")),
      entryDate: String(formData.get("entryDate") ?? "").trim(),
      ratingAtEntry: parseOptionalInt(String(formData.get("ratingAtEntry") ?? "")),
      active: parseCheckbox(formData.get("active")),
      pdgaMembership: parseCheckbox(formData.get("pdgaMembership")),
    },
    actorEmail,
  );
}

export async function markNonHolderAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const pdgaNumber = Number.parseInt(String(formData.get("pdgaNumber") ?? ""), 10);
  if (!Number.isFinite(pdgaNumber)) {
    throw new AdminError("Invalid PDGA number.");
  }
  return markNonHolder(pdgaNumber, actorEmail);
}
