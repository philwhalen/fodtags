import { FilterablePlayersRoster } from "@/components/public/FilterablePlayersRoster";
import { FreshnessHeader } from "@/components/public/FreshnessHeader";
import type { PublicPlayersIndexPayload } from "@/lib";
import { getPublished } from "@server/db/repositories/readModel";

export const dynamic = "force-dynamic";

export default async function PlayersIndexPage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { season } = await params;
  const seasonYear = Number(season);
  const { q } = await searchParams;
  const published = getPublished(seasonYear, "players");

  if (!published) {
    return (
      <article className="players-view">
        <header className="players-view-header">
          <h1 className="standings-view-title">{season} Players</h1>
          <FreshnessHeader
            updatedAt={new Date(0).toISOString()}
            stale={false}
            pendingReview={0}
          />
        </header>
        <div className="standings-empty" role="status">
          <p>Player profiles will appear once the roster is published.</p>
        </div>
      </article>
    );
  }

  const payload = published.payload as PublicPlayersIndexPayload;

  return (
    <article className="players-view">
      <header className="players-view-header">
        <h1 className="standings-view-title">{season} Players</h1>
        <FreshnessHeader
          updatedAt={payload.updatedAt}
          stale={payload.stale}
          pendingReview={payload.pendingReview}
        />
      </header>
      <FilterablePlayersRoster
        rows={payload.holders}
        seasonYear={seasonYear}
        initialQuery={q ?? ""}
      />
    </article>
  );
}
