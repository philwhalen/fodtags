// PURE MODULE — see src/server/engine/index.ts for the purity contract.
// No DB, no clock, no fetch, no Next.js, no `server-only`.

import type { Pool, StandingRow } from "@/lib";

/** A tag holder as the engine needs to see it — a plain, DB-shape-agnostic object. */
export interface StandingsHolder {
  id: number;
  name: string;
  tagNumber: number;
  pool: Pool;
}

export interface StandingsInput {
  holders: StandingsHolder[];
  /**
   * Raw results feeding the scoring computation. Always `[]` in the
   * walking skeleton — accepted for signature stability but does not yet
   * affect the output. Full scoring (points tables, top-N caps, etc.)
   * arrives with Spec 02's feature work.
   */
  results: [];
}

export interface StandingsOutput {
  poolA: StandingRow[];
  poolB: StandingRow[];
}

/**
 * Skeleton standings (Spec 04 §4.4 pre-season empty state): every holder
 * sits at 0 points, split by pool, ranked by ascending tag number — the
 * Spec 02 §2.6 tie-break (low tag wins), which at 0 points fully
 * determines order. Pure and deterministic: no dependence on wall-clock
 * time or insertion order.
 */
export function computeStandings(input: StandingsInput): StandingsOutput {
  const byPool = (pool: Pool): StandingRow[] =>
    input.holders
      .filter((h) => h.pool === pool)
      .slice()
      .sort((a, b) => a.tagNumber - b.tagNumber)
      .map((h, index) => ({
        rank: index + 1,
        playerId: h.id,
        name: h.name,
        tagNumber: h.tagNumber,
        points: 0,
        pool,
      }));

  return {
    poolA: byPool("A"),
    poolB: byPool("B"),
  };
}
