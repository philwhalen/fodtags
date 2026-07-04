// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { poolSwitches, type Pool } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (that's the pure engine,
 * sub-plan 02, which honors the pre-switch-points forfeiture rule).
 */

export interface NewPoolSwitchInput {
  seasonYear: number;
  holderId: number;
  effectiveDate: string;
  fromPool: Pool;
  toPool: Pool;
  /** Director email — a switch is always director-approved (Spec 10 §10.2). */
  approvedBy: string;
}

export function insertSwitch(input: NewPoolSwitchInput): number {
  const result = db.insert(poolSwitches).values(input).run();
  return Number(result.lastInsertRowid);
}

export function listSwitchesByHolder(holderId: number) {
  return db.select().from(poolSwitches).where(eq(poolSwitches.holderId, holderId)).all();
}

export function listSwitchesBySeason(seasonYear: number) {
  return db.select().from(poolSwitches).where(eq(poolSwitches.seasonYear, seasonYear)).all();
}
