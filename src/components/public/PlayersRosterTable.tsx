import type { Route } from "next";
import Link from "next/link";

import { formatTagNumber } from "@/lib";
import type { PlayersIndexRow } from "@/lib";

export function PlayersRosterTable({
  rows,
  seasonYear,
}: {
  rows: PlayersIndexRow[];
  seasonYear: number;
}) {
  return (
    <div className="standings-table-wrap">
      <table className="standings-table">
        <caption className="standings-table-caption">Tag holders</caption>
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Tag #</th>
            <th scope="col">Pool</th>
            <th scope="col">Present rating</th>
            <th scope="col">Champ. rank</th>
            <th scope="col">Rounds</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.holderId} className="standings-row">
              <td data-label="Player">
                <Link
                  href={`/${seasonYear}/players/${row.slug}` as Route}
                  className="standings-player-link"
                >
                  {row.name}
                </Link>
                {row.provisional ? (
                  <span className="profile-flag roster-pending-badge" role="status">
                    Pending confirmation
                  </span>
                ) : null}
              </td>
              <td data-label="Tag #">{formatTagNumber(row.tagNumber)}</td>
              <td data-label="Pool">{row.pool}</td>
              <td data-label="Present rating">
                {row.presentRating ?? "— (Unrated)"}
              </td>
              <td data-label="Champ. rank">{row.championshipRank || "—"}</td>
              <td data-label="Rounds">{row.roundCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
