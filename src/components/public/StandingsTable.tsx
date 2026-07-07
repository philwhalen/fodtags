import type { Route } from "next";
import Link from "next/link";

import { formatTagNumber, roundToOneDecimal } from "@/lib";
import type { PublicStandingsRow } from "@/lib/standings-view";

/**
 * Mobile-first PDGA-style ranked table (Spec 04 §4.2, Spec 11 §11.2).
 * Semantic `<table>` with headers; rows are tappable profile links.
 */
export function StandingsTable({
  rows,
  seasonYear,
}: {
  rows: PublicStandingsRow[];
  seasonYear?: number;
}) {
  return (
    <div className="standings-table-wrap">
      <table className="standings-table">
        <caption className="standings-table-caption">Standings</caption>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Player</th>
            <th scope="col">Tag #</th>
            <th scope="col">Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.playerId} className="standings-row">
              <td data-label="Rank">
                {row.rank}
                {row.tieBrokenByTag ? (
                  <span
                    className="tie-break-marker"
                    title="Tie broken by tag number"
                    aria-label="Tie broken by tag number"
                  >
                    *
                  </span>
                ) : null}
              </td>
              <td data-label="Player">
                {seasonYear === undefined ? (
                  row.name
                ) : (
                  <Link
                    href={`/${seasonYear}/players/${row.slug}` as Route}
                    className="standings-player-link"
                  >
                    {row.name}
                  </Link>
                )}
              </td>
              <td data-label="Tag #">{formatTagNumber(row.tagNumber)}</td>
              <td data-label="Points">{roundToOneDecimal(row.points)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
