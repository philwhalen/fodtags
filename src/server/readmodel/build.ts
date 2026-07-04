// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import { computeStandings } from "@server/engine";
import { listHolders } from "@server/db/repositories/tagHolders";
import type { StandingRow } from "@/lib";

/**
 * View-shaped payload for a `read_model` row. `updatedAt` is generated HERE
 * (at the build/readmodel edge), not inside the pure engine — the engine
 * stays clock-free (see src/server/engine/index.ts's purity contract).
 */
export interface StandingsViewPayload {
  rows: StandingRow[];
  updatedAt: string;
}

/** One not-yet-published view row, keyed by the deep-link-aligned `viewKey`. */
export interface ViewRow {
  seasonYear: number;
  /** e.g. `championship/pool-a` (Spec 04 §4.5 deep-link naming). */
  viewKey: string;
  payload: StandingsViewPayload;
}

/**
 * Load inputs (repositories only — no PDGA, no direct DB writes here),
 * run the PURE engine, and shape the result into view rows keyed by
 * `viewKey`. Only the championship pool views are built in the skeleton
 * (Spec 04 §4.5 later adds `sub-league/<name>/pool-<a|b>`).
 *
 * `results` is always `[]` in the skeleton — the engine's signature is
 * stable for when real results arrive (sub-plan 06+ / feature specs).
 */
export function buildViews(seasonYear: number): ViewRow[] {
  const holders = listHolders(seasonYear).map((h) => ({
    id: h.id,
    name: h.name,
    tagNumber: h.tagNumber,
    pool: h.pool,
  }));

  const { poolA, poolB } = computeStandings({ holders, results: [] });

  const updatedAt = new Date().toISOString();

  return [
    { seasonYear, viewKey: "championship/pool-a", payload: { rows: poolA, updatedAt } },
    { seasonYear, viewKey: "championship/pool-b", payload: { rows: poolB, updatedAt } },
  ];
}
