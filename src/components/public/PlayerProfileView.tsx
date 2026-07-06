"use client";

import { useMemo, useState } from "react";

import { projectProfile } from "@/lib";
import type { PublicProfilePayload, SubLeagueSlug } from "@/lib";

import {
  ProfileChampionshipSection,
  ProfileHeader,
  ProfileMoneySection,
  ProfileOlpSection,
  ProfilePointsSection,
  ProfileRoundsSection,
} from "./ProfileSections";
import { ProfileSubLeagueSelector } from "./ProfileSubLeagueSelector";

export function PlayerProfileView({
  payload,
  seasonYear,
  initialSubLeague,
  currentSubLeague,
}: {
  payload: PublicProfilePayload;
  seasonYear: number;
  initialSubLeague: SubLeagueSlug;
  currentSubLeague: SubLeagueSlug;
}) {
  const [activeSubLeague, setActiveSubLeague] = useState(initialSubLeague);
  const view = useMemo(
    () => projectProfile(payload, seasonYear, activeSubLeague),
    [payload, seasonYear, activeSubLeague],
  );

  return (
    <article className="player-profile">
      <ProfileHeader view={view.header} />
      <ProfileSubLeagueSelector
        active={activeSubLeague}
        current={currentSubLeague}
        onChange={setActiveSubLeague}
      />
      <ProfileChampionshipSection section={view.championship} />
      <ProfilePointsSection section={view.points} />
      <ProfileRoundsSection section={view.rounds} />
      <ProfileOlpSection section={view.olp} />
      <ProfileMoneySection section={view.money} />
    </article>
  );
}
