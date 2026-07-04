// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { eventSources } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (that's the pure engine,
 * sub-plan 04).
 */

export function listActiveSources(seasonYear: number) {
  return db
    .select()
    .from(eventSources)
    .where(and(eq(eventSources.seasonYear, seasonYear), eq(eventSources.active, true)))
    .all();
}
