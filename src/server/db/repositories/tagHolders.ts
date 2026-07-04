// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { tagHolders } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (that's the pure engine,
 * sub-plan 04).
 */

export function listHolders(seasonYear: number) {
  return db.select().from(tagHolders).where(eq(tagHolders.seasonYear, seasonYear)).all();
}
