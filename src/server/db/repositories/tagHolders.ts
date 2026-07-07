// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { and, eq, ne } from "drizzle-orm";

import { db } from "@server/db/client";
import { tagHolders, type Pool } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (that's the pure engine,
 * sub-plan 02/03).
 */

export function listHolders(seasonYear: number) {
  return db.select().from(tagHolders).where(eq(tagHolders.seasonYear, seasonYear)).all();
}

export function getHolder(id: number) {
  return db.select().from(tagHolders).where(eq(tagHolders.id, id)).get();
}

/**
 * Returns a conflicting holder if `tagNumber` is already taken this season.
 * A null `tagNumber` never collides (SQLite treats NULLs as distinct in the
 * unique index too — see schema.ts) — "unique when present" is an
 * app-level contract enforced here and by callers (sub-plan 04's
 * `confirmHolder`), not by the DB constraint alone.
 */
export function findHolderByTagNumber(
  seasonYear: number,
  tagNumber: number | null,
  excludeId?: number,
) {
  if (tagNumber == null) {
    return undefined;
  }
  const conditions = [eq(tagHolders.seasonYear, seasonYear), eq(tagHolders.tagNumber, tagNumber)];
  if (excludeId !== undefined) {
    conditions.push(ne(tagHolders.id, excludeId));
  }
  return db
    .select()
    .from(tagHolders)
    .where(and(...conditions))
    .get();
}

export interface NewTagHolderInput {
  seasonYear: number;
  name: string;
  /** Null for an auto-added provisional holder (Spec 03 §3.5) — no tag
   * assigned until a director confirms one. */
  tagNumber?: number | null;
  pool: Pool;
  entryDate: string;
  pdgaNumber?: number | null;
  ratingAtEntry?: number | null;
  active?: boolean;
  pdgaMembership?: boolean;
  /** Defaults true (existing/seeded/admin-created holders). Auto-add
   * (sub-plan 03) passes `false` for a provisional holder. */
  confirmed?: boolean;
}

/** Used by the admin roster form (sub-plan 06), the seed fixture, and
 * auto-add provisional-holder creation (sub-plan 03). */
export function insertHolder(input: NewTagHolderInput): number {
  const result = db
    .insert(tagHolders)
    .values({
      seasonYear: input.seasonYear,
      name: input.name,
      tagNumber: input.tagNumber ?? null,
      pool: input.pool,
      entryDate: input.entryDate,
      pdgaNumber: input.pdgaNumber ?? null,
      ratingAtEntry: input.ratingAtEntry ?? null,
      active: input.active ?? true,
      pdgaMembership: input.pdgaMembership ?? false,
      confirmed: input.confirmed ?? true,
    })
    .run();
  return Number(result.lastInsertRowid);
}

export type TagHolderPatch = Partial<Omit<NewTagHolderInput, "seasonYear">>;

export function updateHolder(id: number, patch: TagHolderPatch): void {
  db.update(tagHolders).set(patch).where(eq(tagHolders.id, id)).run();
}

/**
 * Provisional (auto-added, not-yet-confirmed) active holders — feeds the
 * review queue's "confirm" list (sub-plan 04) and `countPending`. Ordered by
 * `id` so creation order is stable (matches the auto-add pipeline's
 * within-run insert order).
 */
export function listProvisionalHolders(seasonYear: number) {
  return db
    .select()
    .from(tagHolders)
    .where(
      and(
        eq(tagHolders.seasonYear, seasonYear),
        eq(tagHolders.confirmed, false),
        eq(tagHolders.active, true),
      ),
    )
    .orderBy(tagHolders.id)
    .all();
}

/**
 * The active, unconfirmed (auto-added) holder currently on this PDGA #, if
 * any — used by `markNonHolder` (sub-plan 04) to retire a provisional
 * record when a director excludes its entrant. The `confirmed = false`
 * condition is the guard baked into the query itself: this can never
 * return, and therefore never lets a caller silently deactivate, a
 * director-confirmed holder.
 */
export function findActiveProvisionalHolderByPdgaNumber(seasonYear: number, pdgaNumber: number) {
  return db
    .select()
    .from(tagHolders)
    .where(
      and(
        eq(tagHolders.seasonYear, seasonYear),
        eq(tagHolders.pdgaNumber, pdgaNumber),
        eq(tagHolders.confirmed, false),
        eq(tagHolders.active, true),
      ),
    )
    .get();
}
