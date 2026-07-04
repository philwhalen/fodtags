// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@server/db/client";
import { auditLog } from "@server/db/schema";

/**
 * Thin, typed data access — append-only (Spec 10 §10.1). Every admin write
 * (sub-plan 06) is expected to call `recordAudit` alongside its own
 * table's write.
 */

export interface RecordAuditInput {
  seasonYear: number;
  actorEmail: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  /** Defaults to now (UTC ISO-8601) if omitted. */
  at?: string;
}

export function recordAudit(input: RecordAuditInput): number {
  const result = db
    .insert(auditLog)
    .values({
      seasonYear: input.seasonYear,
      actorEmail: input.actorEmail,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before ?? null,
      after: input.after ?? null,
      ...(input.at !== undefined ? { at: input.at } : {}),
    })
    .run();
  return Number(result.lastInsertRowid);
}

/** Most recent entries first. */
export function listAudit(seasonYear: number, limit = 50) {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.seasonYear, seasonYear))
    .orderBy(desc(auditLog.id))
    .limit(limit)
    .all();
}
