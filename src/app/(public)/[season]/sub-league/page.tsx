import { redirect } from "next/navigation";

import { getCurrentSubLeagueSlug } from "@server/readmodel/currentSubLeague";

/**
 * `/sub-league` redirect alias (Spec 04 §4.5): always resolves to the
 * current sub-league, Pool A. Reads only the published `sub-leagues` meta
 * view via `getCurrentSubLeagueSlug` — never recomputes, never touches
 * `event_sources` directly (CLAUDE.md).
 *
 * `force-dynamic` (same as the standings pages) so the redirect target is
 * recomputed per request against the ET clock as the season advances.
 */
export const dynamic = "force-dynamic";

export default async function SubLeagueAliasPage({
  params,
}: {
  params: Promise<{ season: string }>;
}) {
  const { season } = await params;
  const seasonYear = Number(season);

  // Pre-publish safety net: fall back to a static default slug rather than
  // 404ing before the season's first read model exists.
  const current = getCurrentSubLeagueSlug(seasonYear) ?? "early";

  redirect(`/${season}/sub-league/${current}/pool-a`);
}
