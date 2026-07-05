import type { Route } from "next";
import Link from "next/link";

import { Sparkline } from "@/components/public/Sparkline";
import { serializeRoundsFilter, subLeagueLabel } from "@/lib";
import type { EventType, RoundsFilter, RoundsHolderEntry, RoundRow, SubLeagueType } from "@/lib";

function rosterHref(seasonYear: number, filter: RoundsFilter): Route {
  const base = `/${seasonYear}/rounds`;
  const serialized = serializeRoundsFilter(filter);
  const search = new URLSearchParams();
  if (serialized.league !== undefined) {
    search.set("league", serialized.league);
  }
  if (serialized.types !== undefined) {
    search.set("types", serialized.types);
  }
  const qs = search.toString();
  return (qs ? `${base}?${qs}` : base) as Route;
}

function filterScopeLabel(filter: RoundsFilter): string {
  if (filter.league !== null) {
    return `${subLeagueLabel(filter.league)} League Nights`;
  }

  const parts = ["League Nights"];
  if (filter.types.includes("tournament")) {
    parts.push("Tournament");
  }
  if (filter.types.includes("fodopen")) {
    parts.push("FOD Open");
  }
  return parts.length === 1 ? "League Nights" : parts.join(", ");
}

function subLeagueTypeLabel(subLeague: SubLeagueType): string {
  switch (subLeague) {
    case "EARLY":
      return subLeagueLabel("early");
    case "MID":
      return subLeagueLabel("mid");
    case "LATE":
      return subLeagueLabel("late");
  }
}

function eventTypeName(type: EventType): string {
  switch (type) {
    case "LeagueNight":
      return "League Night";
    case "Tournament":
      return "Tournament";
    case "FODOpen":
      return "FOD Open";
  }
}

function roundSubLeagueCell(round: RoundRow): string {
  if (round.type === "LeagueNight" && round.subLeague !== null) {
    return subLeagueTypeLabel(round.subLeague);
  }
  return eventTypeName(round.type);
}

function eventRoundCell(round: RoundRow): string {
  if (round.roundOrdinal === null) {
    return round.eventLabel;
  }
  const suffix =
    round.type === "LeagueNight"
      ? ` · League Night ${round.roundOrdinal}`
      : ` · R${round.roundOrdinal}`;
  return `${round.eventLabel}${suffix}`;
}

function formatScoreToPar(score: number): string {
  if (score === 0) {
    return "E";
  }
  if (score > 0) {
    return `+${score}`;
  }
  return String(score);
}

export function PlayerRoundsView({
  entry,
  filter,
  rounds,
  trend,
  seasonYear,
}: {
  entry: RoundsHolderEntry;
  filter: RoundsFilter;
  rounds: RoundRow[];
  trend: number[];
  seasonYear: number;
}) {
  return (
    <article className="player-rounds-view">
      <header className="player-rounds-header">
        <p className="player-rounds-back">
          <Link href={rosterHref(seasonYear, filter)} className="player-rounds-back-link">
            ← All players
          </Link>
        </p>
        <h1 className="player-rounds-title">{entry.name}</h1>
        <div className="player-rounds-present">
          <span className="player-rounds-present-label">Present rating</span>
          <span className="player-rounds-present-value">
            {entry.presentRating !== null ? (
              entry.presentRating
            ) : (
              <span aria-label="Unrated">—</span>
            )}
          </span>
          <Sparkline series={trend} />
        </div>
        <p className="player-rounds-scope">Showing: {filterScopeLabel(filter)}</p>
      </header>

      {rounds.length > 0 ? (
        <div className="player-rounds-table-wrap">
          <table className="player-rounds-table">
            <caption className="player-rounds-table-caption">Round history</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Sub-league</th>
                <th scope="col">Event / Round</th>
                <th scope="col">Score (to par)</th>
                <th scope="col">Round rating</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((round) => (
                <tr key={round.eventId} className="player-rounds-row">
                  <td data-label="Date">{round.date}</td>
                  <td data-label="Sub-league">{roundSubLeagueCell(round)}</td>
                  <td data-label="Event / Round">{eventRoundCell(round)}</td>
                  <td data-label="Score (to par)">{formatScoreToPar(round.scoreToPar)}</td>
                  <td data-label="Round rating">
                    {round.roundRating !== null ? round.roundRating : "pending"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="player-rounds-empty" role="status">
          No rounds yet for this filter.
        </p>
      )}
    </article>
  );
}
