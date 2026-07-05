import type { ReactNode } from "react";

import type { PublicStandingsViewPayload } from "@/lib/standings-view";

import { EmptyStandingsState } from "./EmptyStandingsState";
import { FilterableStandings } from "./FilterableStandings";
import { FreshnessHeader } from "./FreshnessHeader";

/** Championship / sub-league standings body within the public shell. */
export function StandingsView({
  title,
  payload,
  seasonYear,
  emptyMessage,
  controls,
}: {
  title: string;
  payload: PublicStandingsViewPayload;
  seasonYear: number;
  emptyMessage?: string;
  /** The Spec 04 §4.6 toggle cluster (`<LeaderboardControls>`), rendered above the freshness header on both the populated and empty/pre-season paths. */
  controls?: ReactNode;
}) {
  const { rows, updatedAt, stale, pendingReview, finalized } = payload;
  const allZero = rows.length > 0 && rows.every((row) => row.points === 0);

  return (
    <article className="standings-view">
      <header className="standings-view-header">
        <h1 className="standings-view-title">{title}</h1>
        {controls}
        {finalized === false ? (
          <p className="standings-projection" role="status">
            <span aria-hidden="true">◷</span> Podium bonus not yet finalized
          </p>
        ) : null}
        <FreshnessHeader
          updatedAt={updatedAt}
          stale={stale}
          pendingReview={pendingReview}
        />
      </header>

      {rows.length === 0 || allZero ? (
        <EmptyStandingsState
          rows={rows}
          message={
            emptyMessage ??
            (allZero
              ? "Season not started — roster shown at zero points."
              : "No tag holders on the roster yet.")
          }
        />
      ) : (
        <FilterableStandings rows={rows} seasonYear={seasonYear} />
      )}
    </article>
  );
}
