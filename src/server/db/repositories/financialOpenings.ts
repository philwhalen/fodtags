// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { financialOpenings } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (fund math is the pure engine,
 * Common C / Spec 09 §9.2).
 */

export interface UpsertFinancialOpeningsInput {
  seasonYear: number;
  aceOpeningCents: number;
  reservesOpeningCents: number;
}

export function getOpenings(seasonYear: number) {
  return db
    .select()
    .from(financialOpenings)
    .where(eq(financialOpenings.seasonYear, seasonYear))
    .get();
}

export function upsertOpenings(input: UpsertFinancialOpeningsInput): void {
  db.insert(financialOpenings)
    .values(input)
    .onConflictDoUpdate({
      target: financialOpenings.seasonYear,
      set: {
        aceOpeningCents: input.aceOpeningCents,
        reservesOpeningCents: input.reservesOpeningCents,
      },
    })
    .run();
}
