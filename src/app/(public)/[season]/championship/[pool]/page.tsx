import { notFound } from "next/navigation";

import { StandingsView } from "@/components/public/StandingsView";
import { isValidPool, poolLabel } from "@/lib/public-routes";
import type { PublicStandingsViewPayload } from "@/lib/standings-view";
import { getPublished } from "@server/db/repositories/readModel";

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
  const published = getPublished(seasonYear, `championship/${pool}`);

  if (!published) {
    return (
      <StandingsView
        title={`${season} Championship — ${poolLabel(pool)}`}
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
      title={`${season} Championship — ${poolLabel(pool)}`}
      seasonYear={seasonYear}
      payload={payload}
    />
  );
}
