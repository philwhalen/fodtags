import { notFound } from "next/navigation";

import { FilterableOlp } from "@/components/public/FilterableOlp";
import { FreshnessHeader } from "@/components/public/FreshnessHeader";
import { OlpControls } from "@/components/public/OlpControls";
import { OlpPotSummary } from "@/components/public/OlpPotSummary";
import type { PublicOlpPayload } from "@/lib";
import { isValidSubLeague, subLeagueLabel } from "@/lib/public-routes";
import { getPublished } from "@server/db/repositories/readModel";
import { getCurrentSubLeagueSlug } from "@server/readmodel/currentSubLeague";

/**
 * OLP standings for one sub-league (Spec 06 §6.1 default view, §6.5 deep
 * links). Reads **only** the published read model — never recomputes
 * (CLAUDE.md).
 */
export const dynamic = "force-dynamic";

export default async function OlpPage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string; league: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { season, league } = await params;

  if (!isValidSubLeague(league)) {
    notFound();
  }

  const seasonYear = Number(season);
  const currentSubLeague = getCurrentSubLeagueSlug(seasonYear) ?? "early";
  const controls = (
    <OlpControls season={season} active={league} currentSubLeague={currentSubLeague} />
  );
  const title = `${season} OLP — ${subLeagueLabel(league)}`;

  const published = getPublished(seasonYear, `olp/${league}`);

  if (!published) {
    return (
      <article className="standings-view">
        <header className="standings-view-header">
          <h1 className="standings-view-title">{title}</h1>
          {controls}
          <OlpPotSummary pot={0} projected={true} seasonYear={seasonYear} />
          <FreshnessHeader
            updatedAt={new Date(0).toISOString()}
            stale={false}
            pendingReview={0}
          />
        </header>
        <div className="standings-empty" role="status">
          <p>OLP standings will appear once rounds are played.</p>
        </div>
      </article>
    );
  }

  const payload = published.payload as PublicOlpPayload;
  const { q } = await searchParams;

  return (
    <article className="standings-view">
      <header className="standings-view-header">
        <h1 className="standings-view-title">{title}</h1>
        {controls}
        <OlpPotSummary pot={payload.pot} projected={payload.projected} seasonYear={seasonYear} />
        <FreshnessHeader
          updatedAt={payload.updatedAt}
          stale={payload.stale}
          pendingReview={payload.pendingReview}
        />
      </header>
      <FilterableOlp payload={payload} seasonYear={seasonYear} initialQuery={q ?? ""} />
    </article>
  );
}
