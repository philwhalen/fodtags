// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { and, desc, eq } from "drizzle-orm";

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

export interface ListAuditLogOptions {
  /** When set, only rows with this entity type are returned. */
  entityType?: string;
  /** When set, caps the number of rows (newest first). */
  limit?: number;
}

/** Most recent entries first; optional entity-type filter (Spec 10 §10.1). */
export function listAuditLog(seasonYear: number, options: ListAuditLogOptions = {}) {
  const conditions = [eq(auditLog.seasonYear, seasonYear)];
  if (options.entityType) {
    conditions.push(eq(auditLog.entityType, options.entityType));
  }
  const base = db
    .select()
    .from(auditLog)
    .where(and(...conditions))
    .orderBy(desc(auditLog.id));
  if (options.limit !== undefined) {
    return base.limit(options.limit).all();
  }
  return base.all();
}

/** Most recent entries first. */
export function listAudit(seasonYear: number, limit = 50) {
  return listAuditLog(seasonYear, { limit });
}
