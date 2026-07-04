import { notFound } from "next/navigation";

import { StandingsView } from "@/components/public/StandingsView";
import { isValidPool, isValidSubLeague, poolLabel, subLeagueLabel } from "@/lib/public-routes";
import type { PublicStandingsViewPayload } from "@/lib/standings-view";
import { getPublished } from "@server/db/repositories/readModel";

/**
 * Sub-league standings (Spec 04 §4.1/§4.3/§4.5). Reads only the published
 * read model.
 */

export const dynamic = "force-dynamic";

export default async function SubLeaguePage({
  params,
}: {
  params: Promise<{ season: string; league: string; pool: string }>;
}) {
  const { season, league, pool } = await params;

  if (!isValidSubLeague(league) || !isValidPool(pool)) {
    notFound();
  }

  const seasonYear = Number(season);
  const published = getPublished(seasonYear, `sub-league/${league}/${pool}`);

  if (!published) {
    return (
      <StandingsView
        title={`${season} ${subLeagueLabel(league)} — ${poolLabel(pool)}`}
        seasonYear={seasonYear}
        payload={{
          rows: [],
          updatedAt: new Date(0).toISOString(),
          stale: false,
          pendingReview: 0,
        }}
        emptyMessage="Standings not published yet — roster will appear at zero points."
      />
    );
  }

  const payload = published.payload as PublicStandingsViewPayload;

  return (
    <StandingsView
      title={`${season} ${subLeagueLabel(league)} — ${poolLabel(pool)}`}
      seasonYear={seasonYear}
      payload={payload}
    />
  );
}
