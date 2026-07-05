// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { tagSales } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (tag-sale dollars are computed
 * in the engine from `count`, Spec 09 §9.2).
 */

export interface InsertTagSaleInput {
  seasonYear: number;
  saleDate: string;
  count: number;
  note?: string | null;
}

export function listTagSales(seasonYear: number) {
  return db.select().from(tagSales).where(eq(tagSales.seasonYear, seasonYear)).all();
}

export function getTagSale(id: number) {
  return db.select().from(tagSales).where(eq(tagSales.id, id)).get();
}

export function insertTagSale(input: InsertTagSaleInput): number {
  const result = db.insert(tagSales).values(input).run();
  return Number(result.lastInsertRowid);
}

export function deleteTagSale(id: number): void {
  db.delete(tagSales).where(eq(tagSales.id, id)).run();
}
