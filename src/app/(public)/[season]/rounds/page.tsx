import { FilterableRoster } from "@/components/public/FilterableRoster";
import { FreshnessHeader } from "@/components/public/FreshnessHeader";
import { RoundsControls } from "@/components/public/RoundsControls";
import { parseRoundsFilter, summarizeRoster } from "@/lib";
import type { PublicRoundsPayload } from "@/lib";
import { getPublished } from "@server/db/repositories/readModel";

export const dynamic = "force-dynamic";

export default async function RoundsPage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string }>;
  searchParams: Promise<{ league?: string; types?: string; q?: string }>;
}) {
  const { season } = await params;
  const seasonYear = Number(season);
  const { league, types, q } = await searchParams;
  const filter = parseRoundsFilter({ league, types });
  const controls = <RoundsControls seasonYear={seasonYear} filter={filter} />;

  const published = getPublished(seasonYear, "rounds");

  if (!published) {
    return (
      <article className="rounds-view">
        <header className="rounds-view-header">
          <h1 className="standings-view-title">{season} Rounds & Ratings</h1>
          {controls}
          <FreshnessHeader
            updatedAt={new Date(0).toISOString()}
            stale={false}
            pendingReview={0}
          />
        </header>
        <div className="standings-empty" role="status">
          <p>Rounds not published yet — roster will appear here.</p>
        </div>
      </article>
    );
  }

  const payload = published.payload as PublicRoundsPayload;
  const roster = summarizeRoster(payload.holders, filter);
  const stale = filter.league
    ? payload.staleLeagues.includes(filter.league)
    : payload.stale;

  return (
    <article className="rounds-view">
      <header className="rounds-view-header">
        <h1 className="standings-view-title">{season} Rounds & Ratings</h1>
        {controls}
        <FreshnessHeader
          updatedAt={payload.updatedAt}
          stale={stale}
          pendingReview={payload.pendingReview}
        />
      </header>
      <FilterableRoster
        rows={roster}
        seasonYear={seasonYear}
        filter={filter}
        initialQuery={q ?? ""}
      />
    </article>
  );
}
