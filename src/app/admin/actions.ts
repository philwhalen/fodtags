"use server";

import { revalidatePath } from "next/cache";

import {
  AdminError,
  SEASON_YEAR,
  parseCheckbox,
  parseOptionalInt,
  parsePool,
  parseTagNumber,
} from "@server/admin/context";
import {
  addAdjustment,
  addExpense,
  addTagSale,
  cancelEvent,
  confirmHolder,
  createHolder,
  createHolderForEntrant,
  deleteAdjustment,
  deleteExpense,
  deletePayout,
  deleteTagSale,
  linkEntrant,
  markNonHolder,
  markSubLeagueComplete,
  mergeProvisionalIntoHolder,
  recordPayout,
  recordPoolSwitch,
  registerEventSource,
  setAceCount,
  setEntryCount,
  setEventSourceStale,
  setTagNightOverrides,
  setTagNotPresent,
  updateEventSource,
  updateHolderRecord,
  upsertOpenings,
  type MutationResult,
} from "@server/admin/mutations";
import { requireDirectorEmail } from "@server/admin/require-director";
import type {
  EventSourceType,
  ExpenseCategory,
  FundId,
  PayoutKind,
  SubLeagueType,
} from "@server/db/schema";

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

/** Parses the per-holder `tagOut-<holderId>` fields the tag-night override
 * form submits (Spec 10 §10.9) — one input per pile participant, field
 * count driven by that night's roster rather than a fixed schema. */
export async function setTagNightOverridesAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const eventId = Number.parseInt(String(formData.get("eventId") ?? ""), 10);
  if (!Number.isFinite(eventId)) {
    throw new AdminError("Invalid event id.");
  }

  const tagOuts: Record<number, number> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("tagOut-")) {
      continue;
    }
    const holderId = Number.parseInt(key.slice("tagOut-".length), 10);
    const tagOut = Number.parseInt(String(value), 10);
    if (!Number.isFinite(holderId) || !Number.isFinite(tagOut)) {
      throw new AdminError("Invalid tag-out value.");
    }
    tagOuts[holderId] = tagOut;
  }

  return setTagNightOverrides({ eventId, tagOuts }, actorEmail);
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

/** Blank means "no tag yet" (Spec 10 §10.4 section A) — unlike
 * `parseTagNumber`, which is used where a tag number is required. */
function parseOptionalTagNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  return parseTagNumber(trimmed);
}

export async function confirmHolderAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const id = Number.parseInt(String(formData.get("id") ?? ""), 10);
  if (!Number.isFinite(id)) {
    throw new AdminError("Invalid holder id.");
  }
  return confirmHolder(
    {
      id,
      pool: parsePool(String(formData.get("pool") ?? "")),
      tagNumber: parseOptionalTagNumber(String(formData.get("tagNumber") ?? "")),
      name: String(formData.get("name") ?? "").trim(),
      entryDate: String(formData.get("entryDate") ?? "").trim(),
      ratingAtEntry: parseOptionalInt(String(formData.get("ratingAtEntry") ?? "")),
      pdgaMembership: parseCheckbox(formData.get("pdgaMembership")),
    },
    actorEmail,
  );
}

export async function mergeProvisionalIntoHolderAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const provisionalId = Number.parseInt(String(formData.get("provisionalId") ?? ""), 10);
  const targetHolderId = Number.parseInt(String(formData.get("targetHolderId") ?? ""), 10);
  if (!Number.isFinite(provisionalId) || !Number.isFinite(targetHolderId)) {
    throw new AdminError("Invalid merge input.");
  }
  return mergeProvisionalIntoHolder(provisionalId, targetHolderId, actorEmail);
}

function parseRequiredInt(raw: string, label: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new AdminError(`Invalid ${label}.`);
  }
  return value;
}

function parsePositiveInt(raw: string, label: string): number {
  const value = parseRequiredInt(raw, label);
  if (value <= 0) {
    throw new AdminError(`${label} must be positive.`);
  }
  return value;
}

function parseNonNegativeInt(raw: string, label: string): number {
  const value = parseRequiredInt(raw, label);
  if (value < 0) {
    throw new AdminError(`${label} must be non-negative.`);
  }
  return value;
}

function parseCalendarDate(raw: string, label: string): string {
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new AdminError(`${label} must be YYYY-MM-DD.`);
  }
  return trimmed;
}

function parsePayoutKind(raw: string): PayoutKind {
  if (raw === "OLP" || raw === "SKINS" || raw === "ACE") {
    return raw;
  }
  throw new AdminError("Invalid payout kind.");
}

function parseSubLeague(raw: string): SubLeagueType {
  if (raw === "EARLY" || raw === "MID" || raw === "LATE") {
    return raw;
  }
  throw new AdminError("Invalid sub-league.");
}

function parseExpenseCategory(raw: string): ExpenseCategory {
  const valid: ExpenseCategory[] = ["pdga_fees", "trophies", "ctp", "contingency", "other"];
  if (valid.includes(raw as ExpenseCategory)) {
    return raw as ExpenseCategory;
  }
  throw new AdminError("Invalid expense category.");
}

function parseFundId(raw: string): FundId {
  const valid: FundId[] = [
    "reserves",
    "ace",
    "olp:EARLY",
    "olp:MID",
    "olp:LATE",
    "skins:A",
    "skins:B",
  ];
  if (valid.includes(raw as FundId)) {
    return raw as FundId;
  }
  throw new AdminError("Invalid fund.");
}

function revalidateFinancialAdminPaths(): void {
  revalidatePath("/admin/financials");
  revalidatePath("/admin/entry-counts");
}

export async function setAceCountAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const eventId = parseRequiredInt(String(formData.get("eventId") ?? ""), "event id");
  const aceEntries = parseNonNegativeInt(String(formData.get("aceEntries") ?? ""), "Ace entries");
  const result = await setAceCount(eventId, aceEntries, actorEmail);
  revalidateFinancialAdminPaths();
  return result;
}

export async function upsertOpeningsAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const result = await upsertOpenings(
    {
      aceOpeningCents: parseNonNegativeInt(
        String(formData.get("aceOpeningCents") ?? ""),
        "Ace opening balance",
      ),
      reservesOpeningCents: parseNonNegativeInt(
        String(formData.get("reservesOpeningCents") ?? ""),
        "Reserves opening balance",
      ),
    },
    actorEmail,
  );
  revalidatePath("/admin/financials");
  return result;
}

export async function addTagSaleAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const noteRaw = String(formData.get("note") ?? "").trim();
  const result = await addTagSale(
    {
      saleDate: parseCalendarDate(String(formData.get("saleDate") ?? ""), "Sale date"),
      count: parsePositiveInt(String(formData.get("count") ?? ""), "Tag sale count"),
      note: noteRaw === "" ? null : noteRaw,
    },
    actorEmail,
  );
  revalidatePath("/admin/financials");
  return result;
}

export async function deleteTagSaleAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const id = parseRequiredInt(String(formData.get("id") ?? ""), "tag sale id");
  const result = await deleteTagSale(id, actorEmail);
  revalidatePath("/admin/financials");
  return result;
}

export async function recordPayoutAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const kind = parsePayoutKind(String(formData.get("kind") ?? ""));
  const subLeagueRaw = String(formData.get("subLeague") ?? "").trim();
  const poolRaw = String(formData.get("pool") ?? "").trim();
  const noteRaw = String(formData.get("note") ?? "").trim();
  const result = await recordPayout(
    {
      kind,
      paidDate: parseCalendarDate(String(formData.get("paidDate") ?? ""), "Paid date"),
      amountCents: parsePositiveInt(String(formData.get("amountCents") ?? ""), "Payout amount"),
      subLeague: subLeagueRaw === "" ? null : parseSubLeague(subLeagueRaw),
      pool: poolRaw === "" ? null : parsePool(poolRaw),
      recipientHolderId: parseOptionalInt(String(formData.get("recipientHolderId") ?? "")),
      note: noteRaw === "" ? null : noteRaw,
    },
    actorEmail,
  );
  revalidatePath("/admin/financials");
  return result;
}

export async function deletePayoutAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const id = parseRequiredInt(String(formData.get("id") ?? ""), "payout id");
  const result = await deletePayout(id, actorEmail);
  revalidatePath("/admin/financials");
  return result;
}

export async function addExpenseAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const result = await addExpense(
    {
      spentDate: parseCalendarDate(String(formData.get("spentDate") ?? ""), "Spent date"),
      amountCents: parsePositiveInt(String(formData.get("amountCents") ?? ""), "Expense amount"),
      category: parseExpenseCategory(String(formData.get("category") ?? "")),
      description: String(formData.get("description") ?? "").trim(),
    },
    actorEmail,
  );
  revalidatePath("/admin/financials");
  return result;
}

export async function deleteExpenseAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const id = parseRequiredInt(String(formData.get("id") ?? ""), "expense id");
  const result = await deleteExpense(id, actorEmail);
  revalidatePath("/admin/financials");
  return result;
}

export async function addAdjustmentAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const deltaRaw = String(formData.get("deltaCents") ?? "");
  const deltaCents = Number.parseInt(deltaRaw, 10);
  if (!Number.isFinite(deltaCents) || deltaCents === 0) {
    throw new AdminError("Adjustment amount must be non-zero.");
  }
  const result = await addAdjustment(
    {
      fund: parseFundId(String(formData.get("fund") ?? "")),
      deltaCents,
      adjustedDate: parseCalendarDate(String(formData.get("adjustedDate") ?? ""), "Adjusted date"),
      reason: String(formData.get("reason") ?? "").trim(),
    },
    actorEmail,
  );
  revalidatePath("/admin/financials");
  return result;
}

export async function deleteAdjustmentAction(formData: FormData): Promise<MutationResult> {
  const actorEmail = await requireDirectorEmail();
  const id = parseRequiredInt(String(formData.get("id") ?? ""), "adjustment id");
  const result = await deleteAdjustment(id, actorEmail);
  revalidatePath("/admin/financials");
  return result;
}
