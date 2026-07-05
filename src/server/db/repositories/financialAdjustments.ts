// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { financialAdjustments, type FundId } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (signed adjustment effects on
 * fund balances are computed in the engine, Spec 09 §9.2 / Spec 10 §10.6).
 */

export interface InsertFinancialAdjustmentInput {
  seasonYear: number;
  fund: FundId;
  deltaCents: number;
  adjustedDate: string;
  reason: string;
}

export function listAdjustments(seasonYear: number) {
  return db
    .select()
    .from(financialAdjustments)
    .where(eq(financialAdjustments.seasonYear, seasonYear))
    .all();
}

export function getAdjustment(id: number) {
  return db.select().from(financialAdjustments).where(eq(financialAdjustments.id, id)).get();
}

export function insertAdjustment(input: InsertFinancialAdjustmentInput): number {
  const result = db.insert(financialAdjustments).values(input).run();
  return Number(result.lastInsertRowid);
}

export function deleteAdjustment(id: number): void {
  db.delete(financialAdjustments).where(eq(financialAdjustments.id, id)).run();
}
