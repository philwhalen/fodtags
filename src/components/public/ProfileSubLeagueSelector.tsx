"use client";

import type { SubLeagueSlug } from "@/lib";
import { subLeagueLabel, VALID_SUB_LEAGUES } from "@/lib";

export function ProfileSubLeagueSelector({
  active,
  current,
  onChange,
}: {
  active: SubLeagueSlug;
  current: SubLeagueSlug;
  onChange: (league: SubLeagueSlug) => void;
}) {
  return (
    <div className="profile-subleague-selector" role="group" aria-label="Sub-league">
      {VALID_SUB_LEAGUES.map((league) => {
        const label =
          league === current
            ? `${subLeagueLabel(league)} (now)`
            : subLeagueLabel(league);
        return (
          <button
            key={league}
            type="button"
            className={`profile-subleague-option${active === league ? " is-active" : ""}`}
            aria-pressed={active === league}
            onClick={() => onChange(league)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
