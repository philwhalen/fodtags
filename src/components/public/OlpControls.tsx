"use client";

import type { Route } from "next";
import Link from "next/link";

import { buildOlpLinks } from "@/lib";
import { subLeagueLabel, VALID_SUB_LEAGUES } from "@/lib/public-routes";
import type { SubLeagueSlug } from "@/lib/public-routes";

/**
 * The Spec 06 §6.1 sub-league selector: a single segmented control listing
 * **Early / Mid / Late**, the current one marked "(now)". Unlike
 * `LeaderboardControls`, OLP has no "Overall Championship" option and no
 * pool toggle — OLP exists only per sub-league, across both pools
 * together. Purely a thin renderer over `buildOlpLinks`; every link is a
 * plain `<Link>` to the corresponding §6.5 deep link, so there is no
 * client state to keep in sync.
 */
export function OlpControls({
  season,
  active,
  currentSubLeague,
}: {
  season: string;
  active: SubLeagueSlug;
  currentSubLeague: SubLeagueSlug;
}) {
  const links = buildOlpLinks(season);

  return (
    <div className="lb-controls">
      <div className="lb-segment" role="group" aria-label="OLP sub-league">
        {VALID_SUB_LEAGUES.map((slug) => {
          const isCurrent = slug === currentSubLeague;
          const isActive = slug === active;
          return (
            <Link
              key={slug}
              href={links[slug] as Route}
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
    </div>
  );
}
