import { notFound, redirect } from "next/navigation";
import type { Route } from "next";

import { PlayerRoundsView } from "@/components/public/PlayerRoundsView";
import {
  filterHolderRounds,
  parseRoundsFilter,
  resolveHolderSlug,
  roundTrendSeries,
  type PublicPlayersIndexPayload,
  type PublicRoundsPayload,
} from "@/lib";
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

  if (slug === "search") {
    redirect(`/${season}/players` as Route);
  }

  const indexPublished = getPublished(seasonYear, "players");
  const published = getPublished(seasonYear, "rounds");

  if (!published || !indexPublished) {
    return (
      <article className="player-rounds-view">
        <div className="standings-empty" role="status">
          <p>Rounds not published yet — round history will appear here.</p>
        </div>
      </article>
    );
  }

  const index = indexPublished.payload as PublicPlayersIndexPayload;
  const resolution = resolveHolderSlug(
    slug,
    index.holders.map((holder) => ({ slug: holder.slug })),
  );
  if (resolution.kind === "not_found") {
    notFound();
  }
  if (resolution.kind === "redirect") {
    const params = new URLSearchParams();
    if (filter.league) {
      params.set("league", filter.league);
    }
    if (filter.types.length > 0 && filter.types.join(",") !== "ln") {
      params.set("types", filter.types.join(","));
    }
    const qs = params.toString();
    redirect(
      `/${season}/players/${resolution.slug}/rounds${qs ? `?${qs}` : ""}` as Route,
    );
  }

  const payload = published.payload as PublicRoundsPayload;
  const indexRow = index.holders.find((holder) => holder.slug === resolution.slug);
  const entry = payload.holders.find((holder) => holder.holderId === indexRow?.holderId);

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
