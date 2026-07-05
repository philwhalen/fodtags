import type { Route } from "next";
import Link from "next/link";

import { serializeRoundsFilter } from "@/lib";
import type { RosterRow, RoundsFilter } from "@/lib";

import { Sparkline } from "./Sparkline";

function playerRoundsHref(
  seasonYear: number,
  slug: string,
  filter: RoundsFilter,
): Route {
  const base = `/${seasonYear}/players/${slug}/rounds`;
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

export function RoundsRosterTable({
  rows,
  seasonYear,
  filter,
}: {
  rows: RosterRow[];
  seasonYear: number;
  filter: RoundsFilter;
}) {
  return (
    <div className="roster-table-wrap">
      <table className="roster-table">
        <caption className="roster-table-caption">Rounds roster</caption>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Player</th>
            <th scope="col">Tag #</th>
            <th scope="col">Present rating</th>
            <th scope="col">Rounds</th>
            <th scope="col">Trend</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.holderId} className="roster-row">
              <td data-label="#">{index + 1}</td>
              <td data-label="Player">
                <Link
                  href={playerRoundsHref(seasonYear, row.slug, filter)}
                  className="roster-player-link"
                >
                  {row.name}
                </Link>
              </td>
              <td data-label="Tag #">{row.tagNumber}</td>
              <td data-label="Present rating">
                {row.presentRating !== null ? (
                  row.presentRating
                ) : (
                  <span aria-label="Unrated">—</span>
                )}
              </td>
              <td data-label="Rounds">{row.roundCount}</td>
              <td data-label="Trend">
                <Sparkline series={row.trend} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
