"use client";

import type { Route } from "next";
import Link from "next/link";

import { buildRoundsLinks } from "@/lib";
import type { RoundsFilter, RoundTypeCode } from "@/lib";
import { subLeagueLabel, VALID_SUB_LEAGUES } from "@/lib/public-routes";
import type { SubLeagueSlug } from "@/lib/public-routes";

const TYPE_TOGGLES: { code: RoundTypeCode; label: string }[] = [
  { code: "tournament", label: "Tournament" },
  { code: "fodopen", label: "FOD Open" },
];

export function RoundsControls({
  seasonYear,
  filter,
}: {
  seasonYear: number;
  filter: RoundsFilter;
}) {
  const links = buildRoundsLinks(seasonYear, filter);
  const subLeagueDisabled = filter.league !== null;

  return (
    <div className="rounds-controls">
      <div className="rounds-segment" role="group" aria-label="Sub-league">
        <Link
          href={links.subLeagueHref(null) as Route}
          className="rounds-segment-option"
          aria-current={filter.league === null ? "page" : undefined}
          data-active={filter.league === null || undefined}
        >
          All
        </Link>
        {VALID_SUB_LEAGUES.map((slug) => (
          <Link
            key={slug}
            href={links.subLeagueHref(slug as SubLeagueSlug) as Route}
            className="rounds-segment-option"
            aria-current={filter.league === slug ? "page" : undefined}
            data-active={filter.league === slug || undefined}
          >
            {subLeagueLabel(slug)}
          </Link>
        ))}
      </div>

      <div className="rounds-segment" role="group" aria-label="Event types">
        <span className="rounds-segment-label" data-active>
          League Nights
        </span>
        {TYPE_TOGGLES.map(({ code, label }) => {
          const isActive = filter.types.includes(code);
          if (subLeagueDisabled) {
            return (
              <span
                key={code}
                className="rounds-segment-option"
                aria-disabled="true"
              >
                {label}
              </span>
            );
          }
          return (
            <Link
              key={code}
              href={links.typeToggleHref(code) as Route}
              className="rounds-segment-option"
              aria-current={isActive ? "page" : undefined}
              data-active={isActive || undefined}
            >
              {label}
            </Link>
          );
        })}
        {subLeagueDisabled ? (
          <p className="rounds-type-note">
            Tournament and FOD Open rounds are not tied to a sub-league and do not
            apply when a sub-league is selected.
          </p>
        ) : null}
      </div>
    </div>
  );
}
