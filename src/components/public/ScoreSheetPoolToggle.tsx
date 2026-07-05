"use client";

import type { Route } from "next";
import Link from "next/link";

import { buildScoreSheetLinks } from "@/lib";
import { poolLabel, VALID_POOLS } from "@/lib/public-routes";
import type { PoolSlug } from "@/lib/public-routes";

/**
 * The Spec 07 §7.5 pool toggle: a two-option segmented control (Pool A /
 * Pool B). Unlike OLP/Leaderboards, pools have no "current" notion — just
 * the two stable deep links from `buildScoreSheetLinks`. Purely a thin
 * renderer: every link is a plain `<Link>`, so there is no client state to
 * keep in sync.
 */
export function ScoreSheetPoolToggle({
  season,
  current,
}: {
  season: string;
  current: PoolSlug;
}) {
  const links = buildScoreSheetLinks(season);

  return (
    <div className="lb-controls">
      <div className="lb-segment" role="group" aria-label="Pool">
        {VALID_POOLS.map((slug) => {
          const isActive = slug === current;
          return (
            <Link
              key={slug}
              href={links[slug] as Route}
              className="lb-segment-option"
              aria-current={isActive ? "page" : undefined}
              data-active={isActive || undefined}
            >
              {poolLabel(slug)}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
