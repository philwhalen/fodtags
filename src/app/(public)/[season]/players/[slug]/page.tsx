import { notFound, redirect } from "next/navigation";
import type { Route } from "next";

import { PlayerProfileView } from "@/components/public/PlayerProfileView";
import { FreshnessHeader } from "@/components/public/FreshnessHeader";
import {
  resolveHolderSlug,
  type PublicPlayersIndexPayload,
  type PublicProfilePayload,
} from "@/lib";
import { getPublished } from "@server/db/repositories/readModel";
import { getCurrentSubLeagueSlug } from "@server/readmodel/currentSubLeague";

export const dynamic = "force-dynamic";

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ season: string; slug: string }>;
}) {
  const { season, slug } = await params;
  const seasonYear = Number(season);

  if (slug === "search") {
    redirect(`/${season}/players` as Route);
  }

  const indexPublished = getPublished(seasonYear, "players");
  if (!indexPublished) {
    return (
      <article className="player-profile-view">
        <header className="player-profile-view-header">
          <h1 className="standings-view-title">{season} Player Profile</h1>
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

  const index = indexPublished.payload as PublicPlayersIndexPayload;
  const resolution = resolveHolderSlug(
    slug,
    index.holders.map((holder) => ({ slug: holder.slug })),
  );
  if (resolution.kind === "not_found") {
    notFound();
  }
  if (resolution.kind === "redirect") {
    redirect(`/${season}/players/${resolution.slug}` as Route);
  }

  const profilePublished = getPublished(seasonYear, `players/${resolution.slug}`);
  if (!profilePublished) {
    notFound();
  }

  const payload = profilePublished.payload as PublicProfilePayload;
  const currentSubLeague = getCurrentSubLeagueSlug(seasonYear) ?? "early";

  return (
    <article className="player-profile-view">
      <header className="player-profile-view-header">
        <FreshnessHeader
          updatedAt={payload.updatedAt}
          stale={payload.stale}
          pendingReview={payload.pendingReview}
        />
      </header>
      <PlayerProfileView
        payload={payload}
        seasonYear={seasonYear}
        initialSubLeague={currentSubLeague}
        currentSubLeague={currentSubLeague}
      />
    </article>
  );
}
