// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { directors } from "@server/db/schema";

/**
 * Thin, typed data access — NO business logic (that's the pure engine,
 * sub-plan 04). Auth gating logic (Auth.js callback wiring) lives in
 * sub-plan 08; this module only answers "is this email an active director."
 */

export function isDirector(email: string): boolean {
  const row = db
    .select({ email: directors.email })
    .from(directors)
    .where(and(eq(directors.email, email), eq(directors.active, true)))
    .get();
  return row !== undefined;
}

export interface UpsertDirectorInput {
  email: string;
  addedBy?: string | null;
  active?: boolean;
}

/**
 * Idempotent insert-or-reactivate. Used both by the boot-time bootstrap
 * (`BOOTSTRAP_DIRECTOR_EMAIL`, sub-plan 08) and the admin console's
 * add/remove-director flow. Does not touch `addedAt` on conflict, so the
 * original grant date is preserved across reactivations.
 */
export function upsertDirector(input: UpsertDirectorInput): void {
  const { email, addedBy = null, active = true } = input;
  db.insert(directors)
    .values({ email, addedBy, active })
    .onConflictDoUpdate({
      target: directors.email,
      set: { addedBy, active },
    })
    .run();
}
