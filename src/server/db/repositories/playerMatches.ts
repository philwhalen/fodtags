// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { normalizeName } from "@/lib/normalize-name";
import { db } from "@server/db/client";
import { eventResults, playerMatches } from "@server/db/schema";
import { listHolders } from "@server/db/repositories/tagHolders";

/**
 * Thin, typed data access — NO business logic (that's the pure engine,
 * sub-plan 02/03; the auto-match algorithm itself is Common B).
 */

export interface UpsertMatchInput {
  seasonYear: number;
  pdgaNumber: number;
  holderId: number | null;
  source: "auto" | "admin";
  /** Director email for admin; `"auto"` for auto-links. */
  decidedBy: string;
  /** Defaults to now (UTC ISO-8601) if omitted. */
  decidedAt?: string;
}

/** Sticky upsert on `(seasonYear, pdgaNumber)` (Spec 03 §3.5). Admin
 * decisions always override prior auto-links; auto never replaces admin. */
export function upsertMatch(input: UpsertMatchInput): void {
  const existing = getMatch(input.seasonYear, input.pdgaNumber);
  if (existing?.source === "admin" && input.source === "auto") {
    return;
  }

  const decidedAt = input.decidedAt ?? new Date().toISOString();

  db.insert(playerMatches)
    .values({
      seasonYear: input.seasonYear,
      pdgaNumber: input.pdgaNumber,
      holderId: input.holderId,
      source: input.source,
      decidedBy: input.decidedBy,
      decidedAt,
    })
    .onConflictDoUpdate({
      target: [playerMatches.seasonYear, playerMatches.pdgaNumber],
      set: {
        holderId: input.holderId,
        source: input.source,
        decidedBy: input.decidedBy,
        decidedAt,
      },
    })
    .run();
}

export function getMatch(seasonYear: number, pdgaNumber: number) {
  return db
    .select()
    .from(playerMatches)
    .where(and(eq(playerMatches.seasonYear, seasonYear), eq(playerMatches.pdgaNumber, pdgaNumber)))
    .get();
}

export function listMatches(seasonYear: number) {
  return db.select().from(playerMatches).where(eq(playerMatches.seasonYear, seasonYear)).all();
}

/** Sticky decisions keyed by PDGA number for the matching pipeline. */
export function getStickyMatches(seasonYear: number): Map<number, { holderId: number | null; source: "auto" | "admin" }> {
  const rows = listMatches(seasonYear);
  const map = new Map<number, { holderId: number | null; source: "auto" | "admin" }>();
  for (const row of rows) {
    map.set(row.pdgaNumber, {
      holderId: row.holderId,
      source: row.source as "auto" | "admin",
    });
  }
  return map;
}

export interface SuggestedHolder {
  id: number;
  name: string;
  tagNumber: number;
}

export interface PendingQueueEntry {
  pdgaNumber: number;
  displayName: string;
  appearanceCount: number;
  suggestedHolders: SuggestedHolder[];
}

function suggestHolders(displayName: string, seasonYear: number): SuggestedHolder[] {
  const normalized = normalizeName(displayName);
  return listHolders(seasonYear)
    .filter((h) => normalizeName(h.name) === normalized)
    .map((h) => ({ id: h.id, name: h.name, tagNumber: h.tagNumber }));
}

/** Unmatched/ambiguous entrants awaiting admin resolution (Spec 10 §10.4). */
export function listPendingForQueue(seasonYear: number): PendingQueueEntry[] {
  const sticky = getStickyMatches(seasonYear);
  const unmatchedRows = db
    .select({
      pdgaNumber: eventResults.pdgaNumber,
      displayName: eventResults.displayName,
    })
    .from(eventResults)
    .where(
      and(
        eq(eventResults.seasonYear, seasonYear),
        isNull(eventResults.holderId),
        isNotNull(eventResults.pdgaNumber),
      ),
    )
    .all();

  const byPdga = new Map<number, { displayName: string; count: number }>();
  for (const row of unmatchedRows) {
    const pdga = row.pdgaNumber!;
    const existing = byPdga.get(pdga);
    if (existing) {
      existing.count += 1;
    } else {
      byPdga.set(pdga, { displayName: row.displayName, count: 1 });
    }
  }

  const pending: PendingQueueEntry[] = [];
  for (const [pdgaNumber, { displayName, count }] of byPdga) {
    if (sticky.has(pdgaNumber)) {
      continue;
    }
    pending.push({
      pdgaNumber,
      displayName,
      appearanceCount: count,
      suggestedHolders: suggestHolders(displayName, seasonYear),
    });
  }

  pending.sort((a, b) => a.displayName.localeCompare(b.displayName));
  return pending;
}

export function countPending(seasonYear: number): number {
  return listPendingForQueue(seasonYear).length;
}
