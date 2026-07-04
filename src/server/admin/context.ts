// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import type { Pool } from "@server/db/schema";

/** Launch season — all admin writes are scoped here (CLAUDE.md). */
export const SEASON_YEAR = 2026;

export type AdminErrorCode = "unauthorized" | "validation" | "not_found";

export class AdminError extends Error {
  readonly code: AdminErrorCode;

  constructor(message: string, code: AdminErrorCode = "validation") {
    super(message);
    this.name = "AdminError";
    this.code = code;
  }
}

export function assertActor(actorEmail: string | null | undefined): asserts actorEmail is string {
  if (!actorEmail) {
    throw new AdminError("Unauthorized", "unauthorized");
  }
}

/** Spec 10 §10.2: warn when Pool B is assigned to a ≥900-rated holder. */
export function poolBHighRatingWarning(pool: Pool, ratingAtEntry: number | null | undefined): string | undefined {
  if (pool === "B" && ratingAtEntry !== null && ratingAtEntry !== undefined && ratingAtEntry >= 900) {
    return `Warning: Pool B assigned to a holder rated ${ratingAtEntry} at entry (≥900).`;
  }
  return undefined;
}

export function parseTagNumber(raw: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    throw new AdminError("Tag number must be a positive integer.");
  }
  return value;
}

export function parseOptionalInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  const value = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(value)) {
    throw new AdminError(`Invalid number: ${raw}`);
  }
  return value;
}

export function parsePool(raw: string): Pool {
  if (raw === "A" || raw === "B") {
    return raw;
  }
  throw new AdminError("Pool must be A or B.");
}

export function parseCheckbox(raw: FormDataEntryValue | null): boolean {
  return raw === "on" || raw === "true" || raw === "1";
}
