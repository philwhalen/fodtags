import { notFound } from "next/navigation";

import { PlayerRoundsView } from "@/components/public/PlayerRoundsView";
import { filterHolderRounds, parseRoundsFilter, roundTrendSeries } from "@/lib";
import type { PublicRoundsPayload } from "@/lib";
import { getPublished } from "@server/db/repositories/readModel";

export const dynamic = "force-dynamic";

export default async function PlayerRoundsPage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string; slug: string }>;
  searchParams: Promise<{ league?: string; types?: string }>;
}) {
  const { season, slug } = await params;
  const seasonYear = Number(season);
  const filter = parseRoundsFilter(await searchParams);

  const published = getPublished(seasonYear, "rounds");

  if (!published) {
    return (
      <article className="player-rounds-view">
        <div className="standings-empty" role="status">
          <p>Rounds not published yet — round history will appear here.</p>
        </div>
      </article>
    );
  }

  const payload = published.payload as PublicRoundsPayload;
  // Slug collisions resolve to first match; deferred to Profiles (Feature 6).
  const entry = payload.holders.find((holder) => holder.slug === slug);

  if (!entry) {
    notFound();
  }

  const filtered = filterHolderRounds(entry.rounds, filter);
  const trend = roundTrendSeries(filtered);

  return (
    <PlayerRoundsView
      entry={entry}
      filter={filter}
      rounds={filtered}
      trend={trend}
      seasonYear={seasonYear}
    />
  );
}
