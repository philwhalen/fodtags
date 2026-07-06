// Server-only boundary convention — see CLAUDE.md and
// specs/12-Architecture.md §12.1 / §12.4.
import "server-only";

import {
  splitSkinsPayoutCents,
  type Pool,
  type PublicSkinsPayload,
  type PublicSkinsRow,
  type SeasonResults,
} from "@/lib";

import type { ViewRow } from "./build";

const POOLS: Pool[] = ["A", "B"];

function buildPoolSkinsView(
  seasonYear: number,
  pool: Pool,
  results: SeasonResults,
  nameById: Map<number, string>,
  slugById: Map<number, string>,
  updatedAt: string,
  stale: boolean,
  pendingReview: number,
): ViewRow {
  const purseCents = results.financials.funds.skins[pool];
  const projected = !results.financials.skinsPaidOut[pool];
  const qualifiedRows = results.skins[pool].filter((row) => row.qualified);
  const qualifiedCount = qualifiedRows.length;

  const rows: PublicSkinsRow[] = results.skins[pool].map((row) => {
    const rankAmongQualified = row.qualified
      ? qualifiedRows.findIndex((candidate) => candidate.holderId === row.holderId) + 1
      : null;

    return {
      holderId: row.holderId,
      name: nameById.get(row.holderId) ?? `Holder #${row.holderId}`,
      slug: slugById.get(row.holderId) ?? String(row.holderId),
      tagNumber: row.tagNumber,
      rank: row.rank,
      totalPoints: row.totalPoints,
      eligible: row.eligible,
      qualified: row.qualified,
      projectedPayoutCents:
        rankAmongQualified !== null
          ? splitSkinsPayoutCents(purseCents, qualifiedCount, rankAmongQualified)
          : null,
    };
  });

  const payload: PublicSkinsPayload = {
    pool,
    rows,
    purseCents,
    projected,
    updatedAt,
    stale,
    pendingReview,
  };

  return {
    seasonYear,
    viewKey: `skins/pool-${pool.toLowerCase()}`,
    payload,
  };
}

export function buildSkinsViews(
  seasonYear: number,
  results: SeasonResults,
  nameById: Map<number, string>,
  slugById: Map<number, string>,
  updatedAt: string,
  stale: boolean,
  pendingReview: number,
): ViewRow[] {
  return POOLS.map((pool) =>
    buildPoolSkinsView(
      seasonYear,
      pool,
      results,
      nameById,
      slugById,
      updatedAt,
      stale,
      pendingReview,
    ),
  );
}
