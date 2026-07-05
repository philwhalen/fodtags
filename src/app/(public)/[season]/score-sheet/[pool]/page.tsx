import { notFound } from "next/navigation";

import { FilterableScoreSheet } from "@/components/public/FilterableScoreSheet";
import { FreshnessHeader } from "@/components/public/FreshnessHeader";
import { ScoreSheetPoolToggle } from "@/components/public/ScoreSheetPoolToggle";
import type { PublicScoreSheetPayload } from "@/lib";
import { projectScoreSheet } from "@/lib";
import { isValidPool, poolLabel } from "@/lib/public-routes";
import { getPublished } from "@server/db/repositories/readModel";

/**
 * Pool score sheet (Spec 07 §7.2/§7.5). Reads **only** the published
 * `score-sheet/pool-*` view — never recomputes or touches PDGA (CLAUDE.md).
 */
export const dynamic = "force-dynamic";

export default async function ScoreSheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ season: string; pool: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { season, pool } = await params;

  if (!isValidPool(pool)) {
    notFound();
  }

  const seasonYear = Number(season);
  const controls = <ScoreSheetPoolToggle season={season} current={pool} />;
  const title = `${season} Score Sheet — ${poolLabel(pool)}`;

  const published = getPublished(seasonYear, `score-sheet/${pool}`);

  if (!published) {
    return (
      <article className="standings-view">
        <header className="standings-view-header">
          <h1 className="standings-view-title">{title}</h1>
          {controls}
          <FreshnessHeader
            updatedAt={new Date(0).toISOString()}
            stale={false}
            pendingReview={0}
          />
        </header>
        <div className="standings-empty" role="status">
          <p>Score sheet not published yet — roster will appear here.</p>
        </div>
      </article>
    );
  }

  const payload = published.payload as PublicScoreSheetPayload;
  const view = projectScoreSheet(payload);
  const { q } = await searchParams;

  return (
    <article className="standings-view">
      <header className="standings-view-header">
        <h1 className="standings-view-title">{title}</h1>
        {controls}
        <FreshnessHeader
          updatedAt={payload.updatedAt}
          stale={payload.stale}
          pendingReview={payload.pendingReview}
        />
      </header>
      <FilterableScoreSheet view={view} seasonYear={seasonYear} initialQuery={q ?? ""} />
    </article>
  );
}
