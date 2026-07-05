import { notFound } from "next/navigation";

import { LeaderboardControls } from "@/components/public/LeaderboardControls";
import { StandingsView } from "@/components/public/StandingsView";
import type { LeaderboardView } from "@/lib";
import { isValidPool, poolLabel } from "@/lib/public-routes";
import type { PublicStandingsViewPayload } from "@/lib/standings-view";
import { getPublished } from "@server/db/repositories/readModel";
import { getCurrentSubLeagueSlug } from "@server/readmodel/currentSubLeague";

/**
 * Championship standings (Spec 04 §4.1 default view, §4.5 deep links).
 * Reads **only** the published read model — never recomputes (CLAUDE.md).
 */

export const dynamic = "force-dynamic";

export default async function ChampionshipPage({
  params,
}: {
  params: Promise<{ season: string; pool: string }>;
}) {
  const { season, pool } = await params;

  if (!isValidPool(pool)) {
    notFound();
  }

  const seasonYear = Number(season);
  const currentSubLeague = getCurrentSubLeagueSlug(seasonYear) ?? "early";
  const view: LeaderboardView = { seasonYear, scope: "championship", pool };
  const controls = <LeaderboardControls view={view} currentSubLeague={currentSubLeague} />;

  const published = getPublished(seasonYear, `championship/${pool}`);

  if (!published) {
    return (
      <StandingsView
        title={`${season} Championship — ${poolLabel(pool)}`}
        seasonYear={seasonYear}
        controls={controls}
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
      title={`${season} Championship — ${poolLabel(pool)}`}
      seasonYear={seasonYear}
      controls={controls}
      payload={payload}
    />
  );
}
