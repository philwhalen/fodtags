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

/** Returns a conflicting holder if `tagNumber` is already taken this season. */
export function findHolderByTagNumber(
  seasonYear: number,
  tagNumber: number,
  excludeId?: number,
) {
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
  tagNumber: number;
  pool: Pool;
  entryDate: string;
  pdgaNumber?: number | null;
  ratingAtEntry?: number | null;
  active?: boolean;
  pdgaMembership?: boolean;
}

/** Used by the admin roster form (sub-plan 06) and the seed fixture. */
export function insertHolder(input: NewTagHolderInput): number {
  const result = db
    .insert(tagHolders)
    .values({
      seasonYear: input.seasonYear,
      name: input.name,
      tagNumber: input.tagNumber,
      pool: input.pool,
      entryDate: input.entryDate,
      pdgaNumber: input.pdgaNumber ?? null,
      ratingAtEntry: input.ratingAtEntry ?? null,
      active: input.active ?? true,
      pdgaMembership: input.pdgaMembership ?? false,
    })
    .run();
  return Number(result.lastInsertRowid);
}

export type TagHolderPatch = Partial<Omit<NewTagHolderInput, "seasonYear">>;

export function updateHolder(id: number, patch: TagHolderPatch): void {
  db.update(tagHolders).set(patch).where(eq(tagHolders.id, id)).run();
}
