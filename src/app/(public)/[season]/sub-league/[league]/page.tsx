import type { Route } from "next";
import { notFound, redirect } from "next/navigation";

import { resolveAliasTarget } from "@/lib/alias-target";
import { getCurrentSubLeagueSlug } from "@server/readmodel/currentSubLeague";

/**
 * `/sub-league/<seg>` — a single segment following `/sub-league` that is
 * EITHER a pool slug (alias to the current sub-league, that pool) OR a
 * sub-league slug (convenience default to Pool A). Depth-1, so it does not
 * conflict with the explicit depth-2 `/sub-league/[league]/[pool]` route
 * (Spec 04 §4.5; plans/leaderboards/02-alias-routes.md).
 *
 * `force-dynamic` so the alias target is recomputed per request against the
 * ET clock.
 */
export const dynamic = "force-dynamic";

export default async function SubLeagueSegmentAliasPage({
  params,
}: {
  params: Promise<{ season: string; league: string }>;
}) {
  const { season, league: seg } = await params;
  const seasonYear = Number(season);

  // Pre-publish safety net: fall back to a static default slug rather than
  // 404ing before the season's first read model exists.
  const current = getCurrentSubLeagueSlug(seasonYear) ?? "early";

  const target = resolveAliasTarget(season, seg, current);
  if (target === null) {
    notFound();
  }

  redirect(target as Route);
}
