// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@server/db/client";
import {
  payouts,
  type PayoutKind,
  type Pool,
  type SubLeagueType,
} from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (payout validation and fund
 * effects are the engine / admin mutations, Spec 09 §9.2).
 */

export interface InsertPayoutInput {
  seasonYear: number;
  kind: PayoutKind;
  paidDate: string;
  amountCents: number;
  subLeague?: SubLeagueType | null;
  pool?: Pool | null;
  recipientHolderId?: number | null;
  note?: string | null;
}

export function listPayouts(seasonYear: number) {
  return db.select().from(payouts).where(eq(payouts.seasonYear, seasonYear)).all();
}

export function getPayout(id: number) {
  return db.select().from(payouts).where(eq(payouts.id, id)).get();
}

export function insertPayout(input: InsertPayoutInput): number {
  const result = db.insert(payouts).values(input).run();
  return Number(result.lastInsertRowid);
}

export function deletePayout(id: number): void {
  db.delete(payouts).where(eq(payouts.id, id)).run();
}
