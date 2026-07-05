"use client";

import type { Route } from "next";
import Link from "next/link";

import { buildLeaderboardLinks } from "@/lib";
import type { LeaderboardView } from "@/lib";
import { subLeagueLabel, VALID_SUB_LEAGUES } from "@/lib/public-routes";
import type { SubLeagueSlug } from "@/lib/public-routes";

/**
 * The Spec 04 §4.6 in-page control cluster: a single view toggle listing
 * **Overall Championship** and each sub-league (Early / Mid / Late, with the
 * current one marked "(now)"), plus a pool toggle (A / B). Purely a thin
 * renderer over `buildLeaderboardLinks` — every link is a plain `<Link>` to
 * the corresponding §4.5 deep link, so there is no client state to keep in
 * sync. `currentSubLeague` is used only to mark the "(now)" option.
 */
export function LeaderboardControls({
  view,
  currentSubLeague,
}: {
  view: LeaderboardView;
  currentSubLeague: SubLeagueSlug;
}) {
  const links = buildLeaderboardLinks(view);

  return (
    <div className="lb-controls">
      <div className="lb-segment" role="group" aria-label="Leaderboard view">
        <Link
          href={links.championshipHref as Route}
          className="lb-segment-option"
          aria-current={view.scope === "championship" ? "page" : undefined}
          data-active={view.scope === "championship" || undefined}
        >
          Overall Championship
        </Link>
        {VALID_SUB_LEAGUES.map((slug) => {
          const isCurrent = slug === currentSubLeague;
          const isActive = view.scope === "sub-league" && slug === view.subLeague;
          return (
            <Link
              key={slug}
              href={links.subLeaguePickerHrefs[slug] as Route}
              className="lb-segment-option"
              aria-current={isActive ? "page" : undefined}
              data-active={isActive || undefined}
              title={isCurrent ? "Current sub-league" : undefined}
            >
              {subLeagueLabel(slug)}
              {isCurrent ? <span className="lb-picker-current"> (now)</span> : null}
            </Link>
          );
        })}
      </div>

      <div className="lb-segment" role="group" aria-label="Pool">
        <Link
          href={links.poolAHref as Route}
          className="lb-segment-option"
          aria-current={view.pool === "pool-a" ? "page" : undefined}
          data-active={view.pool === "pool-a" || undefined}
        >
          Pool A
        </Link>
        <Link
          href={links.poolBHref as Route}
          className="lb-segment-option"
          aria-current={view.pool === "pool-b" ? "page" : undefined}
          data-active={view.pool === "pool-b" || undefined}
        >
          Pool B
        </Link>
      </div>
    </div>
  );
}
